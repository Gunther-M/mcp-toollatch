import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import micromatch from "micromatch";
import YAML from "yaml";
import { z } from "zod";
import {
  AppError,
  ensureRecord,
  normalizePathForMatch,
  normalizeSlashes,
  type PolicyDecision,
  type PolicyDecisionAction,
  type RiskLevel,
  type ToolCallRequest,
} from "@mcp-toollatch/core";
import {
  builtInRiskRules,
  defaultAllowedPathPatterns,
  defaultConfirmCommandPatterns,
  defaultDangerousCommandPatterns,
  defaultDeniedDomainPatterns,
  defaultSensitivePathPatterns,
  extractDomainsFromText,
  matchDomainPattern,
  matchSafeShellPattern,
  matchShellPattern,
} from "@mcp-toollatch/rules";

export const defaultPolicyFileName = "toollatch.policy.yaml";
export const defaultAuditLogPath = ".toollatch/audit.jsonl";

export const policyActionSchema = z.enum(["allow", "block", "confirm"]);
export const policyModeSchema = z.enum(["observe", "enforce"]);

export const policyRuleSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().optional(),
    severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    match: z
      .object({
        category: z.string().optional(),
        tools: z.array(z.string()).optional(),
      })
      .default({}),
    action: policyActionSchema.optional(),
    allow_paths: z.array(z.string()).default([]),
    deny_paths: z.array(z.string()).default([]),
    allow_domains: z.array(z.string()).default([]),
    deny_domains: z.array(z.string()).default([]),
    allow_commands: z.array(z.string()).default([]),
    deny_commands: z.array(z.string()).default([]),
    require_confirm: z.boolean().default(false),
    suggested_fix: z.string().optional(),
  })
  .strict();

export const policySchema = z
  .object({
    version: z.literal(1),
    mode: policyModeSchema.default("enforce"),
    defaults: z
      .object({
        unknown_tool: policyActionSchema.default("confirm"),
        log_all_calls: z.boolean().default(true),
        non_interactive_confirm: z.enum(["deny", "allow"]).default("deny"),
      })
      .default({}),
    audit: z
      .object({
        enabled: z.boolean().default(true),
        path: z.string().default(defaultAuditLogPath),
        rotation: z
          .object({
            max_file_size_mb: z.number().positive().default(5),
            max_files: z.number().int().positive().default(5),
          })
          .default({}),
      })
      .default({}),
    rules: z.array(policyRuleSchema).default([]),
  })
  .strict();

export type PolicyAction = z.infer<typeof policyActionSchema>;
export type PolicyMode = z.infer<typeof policyModeSchema>;
export type PolicyProfile = "observe" | "balanced" | "strict";
export type PolicyRule = z.infer<typeof policyRuleSchema>;
export type ToolLatchPolicy = z.infer<typeof policySchema>;

export interface ExtractedToolArguments {
  paths: string[];
  commands: string[];
  urls: string[];
  domains: string[];
  sql: string[];
  sensitiveFieldNames: string[];
}

export interface PolicyEvaluationContext {
  cwd?: string;
  homeDir?: string;
  isInteractive?: boolean;
}

export interface InitPolicyOptions {
  cwd?: string;
  filePath?: string;
  force?: boolean;
  profile?: PolicyProfile;
}

export interface InitPolicyResult {
  filePath: string;
  created: boolean;
  policy: ToolLatchPolicy;
}

export function createDefaultPolicy(): ToolLatchPolicy {
  return createPolicyForProfile("balanced");
}

export function createPolicyForProfile(profile: PolicyProfile): ToolLatchPolicy {
  const mode: PolicyMode = profile === "observe" ? "observe" : "enforce";
  const unknownTool: PolicyAction = profile === "strict" ? "block" : "confirm";
  const filesystemOutsideAction: PolicyAction = profile === "strict" ? "block" : "allow";
  const shellConfirmAction: PolicyAction = profile === "strict" ? "block" : "confirm";

  return policySchema.parse({
    version: 1,
    mode,
    defaults: {
      unknown_tool: unknownTool,
      log_all_calls: true,
      non_interactive_confirm: "deny",
    },
    audit: {
      enabled: true,
      path: defaultAuditLogPath,
      rotation: {
        max_file_size_mb: 5,
        max_files: 5,
      },
    },
    rules: [
      {
        id: "RULE-PATH-001",
        description: "Block sensitive file access.",
        severity: "critical",
        match: { category: "filesystem" },
        deny_paths: [...defaultSensitivePathPatterns],
        action: "block",
        suggested_fix: "Move secrets outside MCP-accessible paths or add a narrow allow rule for non-secret files.",
      },
      {
        id: "RULE-PATH-ALLOW-001",
        description: "Keep default filesystem reads inside common project folders.",
        severity: "high",
        match: { category: "filesystem" },
        allow_paths: [...defaultAllowedPathPatterns],
        action: filesystemOutsideAction,
      },
      {
        id: "RULE-NET-001",
        description: "Block explicitly denied network destinations.",
        severity: "critical",
        match: { category: "network" },
        deny_domains: [...defaultDeniedDomainPatterns],
        action: "block",
        suggested_fix: "Review the destination domain before allowing network access.",
      },
      {
        id: "RULE-NET-002",
        description: "Require explicit network allowlist when allow_domains is configured.",
        severity: "high",
        match: { category: "network" },
        allow_domains: [],
        action: profile === "strict" ? "block" : "confirm",
        suggested_fix: "Add a narrow allow_domains entry only after reviewing the destination.",
      },
      {
        id: "RULE-CMD-001",
        description: "Block dangerous shell commands.",
        severity: "critical",
        match: { category: "shell" },
        deny_commands: [...defaultDangerousCommandPatterns],
        action: "block",
        suggested_fix: "Review and run dangerous commands manually outside the MCP session.",
      },
      {
        id: "RULE-CMD-ALLOW-001",
        description: "Allow only explicitly configured safe shell commands.",
        severity: "low",
        match: { category: "shell" },
        allow_commands: [],
        action: "allow",
        suggested_fix: "Keep allow_commands exact or narrowly wildcarded.",
      },
      {
        id: "RULE-CMD-CONFIRM-001",
        description: "Require confirmation for high impact shell commands.",
        severity: "high",
        match: { category: "shell" },
        deny_commands: [...defaultConfirmCommandPatterns],
        require_confirm: profile !== "strict",
        action: shellConfirmAction,
        suggested_fix: "Confirm only after checking the target environment and command arguments.",
      },
      {
        id: "RULE-UNKNOWN-001",
        description: "Unknown tools require confirmation by default.",
        severity: "medium",
        match: { category: "unknown" },
        require_confirm: profile !== "strict",
        action: unknownTool,
        suggested_fix: "Add an explicit policy rule after reviewing this tool.",
      },
    ],
  });
}

export function createDefaultPolicyYaml(): string {
  return YAML.stringify(createDefaultPolicy());
}

export async function initPolicyFile(options: InitPolicyOptions = {}): Promise<InitPolicyResult> {
  const cwd = options.cwd ?? process.cwd();
  const filePath = path.resolve(cwd, options.filePath ?? defaultPolicyFileName);
  const policy = createPolicyForProfile(options.profile ?? "balanced");

  if (!options.force && (await fileExists(filePath))) {
    throw new AppError(
      "FILE_EXISTS",
      `Policy file already exists: ${filePath}. Use --force to overwrite it.`,
    );
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, YAML.stringify(policy), "utf8");

  return {
    filePath,
    created: true,
    policy,
  };
}

export async function loadPolicyFile(filePath: string): Promise<ToolLatchPolicy> {
  const content = await fs.readFile(filePath, "utf8");
  return parsePolicyYaml(content, filePath);
}

export function parsePolicyYaml(content: string, source = "policy"): ToolLatchPolicy {
  let parsed: unknown;
  try {
    parsed = YAML.parse(content);
  } catch (error) {
    throw new AppError("CONFIG_INVALID", `Invalid YAML in ${source}: ${formatUnknownError(error)}`);
  }

  const result = policySchema.safeParse(parsed);
  if (!result.success) {
    throw new AppError("CONFIG_INVALID", formatPolicyErrors(result.error, source), result.error);
  }

  return result.data;
}

export function formatPolicyErrors(error: z.ZodError, source = "policy"): string {
  const issues = error.issues.map((issue) => {
    const field = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${field}: ${issue.message}`;
  });
  return `Invalid policy in ${source}:\n${issues.join("\n")}`;
}

export function evaluateToolCall(
  policy: ToolLatchPolicy,
  request: ToolCallRequest,
  context: PolicyEvaluationContext = {},
): PolicyDecision {
  const cwd = context.cwd ?? process.cwd();
  const homeDir = context.homeDir ?? os.homedir();
  const extracted = extractToolArguments(request.toolName, request.arguments);
  const category = inferToolCategory(request.toolName, extracted);

  const pathDecision = evaluatePathRules(policy, extracted.paths, category, cwd, homeDir);
  if (pathDecision.action !== "allow") {
    return observeDecision(policy, pathDecision);
  }

  const domainDecision = evaluateDomainRules(policy, extracted.domains, category);
  if (domainDecision.action !== "allow") {
    if (domainDecision.action === "confirm" && context.isInteractive === false) {
      return observeDecision(policy, {
        ...domainDecision,
        action: policy.defaults.non_interactive_confirm === "allow" ? "allow" : "block",
        reason: `${domainDecision.reason} Non-interactive sessions deny confirmation by default.`,
      });
    }
    return observeDecision(policy, domainDecision);
  }

  const commandDecision = evaluateCommandRules(policy, extracted.commands, category);
  if (commandDecision.action === "allow" && commandDecision.matchedRuleId === "RULE-CMD-ALLOW-001") {
    return observeDecision(policy, commandDecision);
  }

  if (commandDecision.action !== "allow") {
    if (commandDecision.action === "confirm" && context.isInteractive === false) {
      return observeDecision(policy, {
        ...commandDecision,
        action: policy.defaults.non_interactive_confirm === "allow" ? "allow" : "block",
        reason: `${commandDecision.reason} Non-interactive sessions deny confirmation by default.`,
      });
    }
    return observeDecision(policy, commandDecision);
  }

  const genericDecision = evaluateGenericRules(policy, category, extracted);
  if (genericDecision.action === "confirm" && context.isInteractive === false) {
    return observeDecision(policy, {
      ...genericDecision,
      action: policy.defaults.non_interactive_confirm === "allow" ? "allow" : "block",
      reason: `${genericDecision.reason} Non-interactive sessions deny confirmation by default.`,
    });
  }

  return observeDecision(policy, genericDecision);
}

export function extractToolArguments(
  toolName: string,
  args: Record<string, unknown>,
): ExtractedToolArguments {
  const paths = new Set<string>();
  const commands = new Set<string>();
  const urls = new Set<string>();
  const domains = new Set<string>();
  const sql = new Set<string>();
  const sensitiveFieldNames = new Set<string>();

  visitArguments(args, (key, value) => {
    const lowerKey = key.toLowerCase();

    if (/(?:^|_)(path|paths|file|files|filepath|filename|directory|dir)(?:$|_)/.test(lowerKey)) {
      collectStrings(value).forEach((item) => paths.add(item));
    }

    if (/(?:command|cmd|script|shell)/.test(lowerKey)) {
      collectStrings(value).forEach((item) => commands.add(item));
    }

    if (/(?:url|uri|endpoint|domain)/.test(lowerKey)) {
      collectStrings(value).forEach((item) => {
        urls.add(item);
        extractDomainsFromText(item).forEach((domain) => domains.add(domain));
        if (/(?:domain|host|hostname)/.test(lowerKey) && !item.includes("://")) {
          domains.add(item);
        }
      });
    }

    if (/(?:sql|query|statement)/.test(lowerKey)) {
      collectStrings(value).forEach((item) => sql.add(item));
    }

    if (/(?:token|secret|password|passwd|api[_-]?key|authorization|cookie)/i.test(key)) {
      sensitiveFieldNames.add(key);
    }
  });

  if (/read_file|write_file|list_dir|filesystem|file/i.test(toolName)) {
    const direct = collectStrings(args.path ?? args.file ?? args.filename ?? args.directory);
    direct.forEach((item) => paths.add(item));
  }

  if (/shell|command|exec|run/i.test(toolName)) {
    const direct = collectStrings(args.command ?? args.cmd ?? args.script);
    direct.forEach((item) => {
      commands.add(item);
      extractDomainsFromText(item).forEach((domain) => domains.add(domain));
    });
  }

  return {
    paths: [...paths],
    commands: [...commands],
    urls: [...urls],
    domains: [...domains],
    sql: [...sql],
    sensitiveFieldNames: [...sensitiveFieldNames],
  };
}

export function inferToolCategory(
  toolName: string,
  extracted: ExtractedToolArguments,
): "filesystem" | "shell" | "network" | "database" | "unknown" {
  if (/read_file|write_file|list_dir|filesystem|file|directory/i.test(toolName)) {
    return "filesystem";
  }

  if (/shell|command|exec|run/i.test(toolName) || extracted.commands.length > 0) {
    return "shell";
  }

  if (/fetch|http|url|upload|download|network/i.test(toolName) || extracted.urls.length > 0) {
    return "network";
  }

  if (/sql|query|database|postgres|mysql|sqlite/i.test(toolName) || extracted.sql.length > 0) {
    return "database";
  }

  if (extracted.paths.length > 0) {
    return "filesystem";
  }

  return "unknown";
}

function evaluatePathRules(
  policy: ToolLatchPolicy,
  paths: string[],
  category: string,
  cwd: string,
  homeDir: string,
): PolicyDecision {
  if (paths.length === 0) {
    return allowDecision();
  }

  const normalizedPaths = paths.map((item) => normalizePathForMatch(item, cwd, homeDir));

  for (const rule of applicableRules(policy, category)) {
    for (const pattern of rule.deny_paths) {
      const normalizedPattern = normalizePolicyPathPattern(pattern, cwd, homeDir);
      const matched = normalizedPaths.find((candidate) => matchPath(candidate, normalizedPattern));
      if (matched !== undefined) {
        return makeDecision("block", rule.severity, rule, `Path is denied by policy: ${matched}`, matched);
      }
    }
  }

  const allowPatterns = applicableRules(policy, category).flatMap((rule) => rule.allow_paths);
  if (allowPatterns.length > 0) {
    const outside = normalizedPaths.find((candidate) => {
      return !allowPatterns.some((pattern) =>
        matchPath(candidate, normalizePolicyPathPattern(pattern, cwd, homeDir)),
      );
    });

    if (outside !== undefined) {
      const allowRule = applicableRules(policy, category).find((rule) => rule.allow_paths.length > 0);
      return makeDecision(
        allowRule?.action === "block" ? "block" : "confirm",
        "high",
        {
          id: "RULE-PATH-ALLOW-001",
          description: "Path is outside configured allow_paths.",
          severity: "high",
          match: { category },
          action: "confirm",
          allow_paths: [],
          deny_paths: [],
          allow_domains: [],
          deny_domains: [],
          allow_commands: [],
          deny_commands: [],
          require_confirm: true,
          suggested_fix: "Add a narrow allow_paths entry if this location is expected.",
        },
        `Path is outside allow_paths: ${outside}`,
        outside,
      );
    }
  }

  return allowDecision();
}

function evaluateDomainRules(
  policy: ToolLatchPolicy,
  domains: string[],
  category: string,
): PolicyDecision {
  if (domains.length === 0) {
    return allowDecision();
  }

  const rules = applicableDomainRules(policy, category);

  for (const rule of rules) {
    for (const pattern of rule.deny_domains) {
      const matched = domains.find((domain) => matchDomainPattern(domain, pattern));
      if (matched !== undefined) {
        return makeDecision(
          "block",
          rule.severity,
          rule,
          `Domain is denied by policy pattern "${pattern}": ${matched}`,
          matched,
        );
      }
    }
  }

  const allowRules = rules.filter((rule) => rule.allow_domains.length > 0);
  if (allowRules.length === 0) {
    return allowDecision();
  }

  const outside = domains.find((domain) => {
    return !allowRules.some((rule) => rule.allow_domains.some((pattern) => matchDomainPattern(domain, pattern)));
  });

  if (outside !== undefined) {
    const rule = allowRules[0];
    return makeDecision(
      rule?.action === "block" ? "block" : "confirm",
      rule?.severity ?? "high",
      rule ?? {
        id: "RULE-NET-002",
        description: "Domain is outside configured allow_domains.",
        severity: "high",
        match: { category: "network" },
        action: "confirm",
        allow_paths: [],
        deny_paths: [],
        allow_domains: [],
        deny_domains: [],
        allow_commands: [],
        deny_commands: [],
        require_confirm: true,
        suggested_fix: "Add a narrow allow_domains entry if this destination is expected.",
      },
      `Domain is outside allow_domains: ${outside}`,
      outside,
    );
  }

  return allowDecision();
}

function evaluateCommandRules(
  policy: ToolLatchPolicy,
  commands: string[],
  category: string,
): PolicyDecision {
  if (commands.length === 0) {
    return allowDecision();
  }

  for (const rule of applicableRules(policy, category)) {
    for (const pattern of rule.deny_commands) {
      const matched = commands.find((command) => matchCommand(command, pattern));
      if (matched !== undefined) {
        const action = rule.require_confirm || rule.action === "confirm" ? "confirm" : "block";
        return makeDecision(action, rule.severity, rule, `Command matched policy pattern "${pattern}": ${matched}`, matched);
      }
    }
  }

  const allowRules = applicableRules(policy, category).filter((rule) => rule.allow_commands.length > 0);
  if (allowRules.length > 0) {
    const unlisted = commands.find((command) => {
      return !allowRules.some((rule) => rule.allow_commands.some((pattern) => matchSafeShellPattern(command, pattern)));
    });

    const allowRule = allowRules[0];
    if (unlisted === undefined && allowRule !== undefined) {
      return makeDecision(
        "allow",
        "low",
        allowRule,
        "Command matched explicit safe shell allowlist.",
        commands.join(" && "),
      );
    }

    if (unlisted !== undefined && allowRule !== undefined) {
      return makeDecision(
        "confirm",
        "high",
        {
          ...allowRule,
          action: "confirm",
          require_confirm: true,
          suggested_fix: "Add an exact allow_commands entry only after reviewing this shell command.",
        },
        `Command is outside allow_commands: ${unlisted}`,
        unlisted,
      );
    }
  }

  return allowDecision();
}

function evaluateGenericRules(
  policy: ToolLatchPolicy,
  category: string,
  extracted: ExtractedToolArguments,
): PolicyDecision {
  if (category === "unknown") {
    const action = policy.defaults.unknown_tool;
    const risk: RiskLevel = extracted.sensitiveFieldNames.length > 0 ? "high" : "medium";
    return {
      action,
      risk,
      reason: "Unknown tool category; policy requires an explicit decision.",
      matchedRuleId: "RULE-UNKNOWN-001",
      matchedRuleTitle: "Unknown tool",
      suggestedFix: "Add an explicit policy rule after reviewing this MCP tool.",
    };
  }

  const rules = applicableRules(policy, category);
  const confirmRule = rules.find((rule) => rule.require_confirm || rule.action === "confirm");

  if (confirmRule !== undefined) {
    return makeDecision("confirm", confirmRule.severity, confirmRule, "Tool call requires confirmation by policy.");
  }

  return allowDecision();
}

function applicableRules(policy: ToolLatchPolicy, category: string): PolicyRule[] {
  return policy.rules.filter((rule) => {
    const matchCategory = rule.match.category;
    if (matchCategory !== undefined && matchCategory !== category) {
      return false;
    }
    return true;
  });
}

function applicableDomainRules(policy: ToolLatchPolicy, category: string): PolicyRule[] {
  return policy.rules.filter((rule) => {
    if (rule.allow_domains.length === 0 && rule.deny_domains.length === 0) {
      return false;
    }

    const matchCategory = rule.match.category;
    return matchCategory === undefined || matchCategory === "network" || matchCategory === category;
  });
}

function makeDecision(
  action: PolicyDecisionAction,
  risk: RiskLevel,
  rule: PolicyRule,
  reason: string,
  matchedValue?: string,
): PolicyDecision {
  const descriptor = builtInRiskRules.find((item) => item.id === rule.id);
  return {
    action,
    risk,
    reason,
    matchedRuleId: rule.id,
    matchedRuleTitle: descriptor?.title ?? rule.description,
    matchedValue,
    suggestedFix: rule.suggested_fix ?? descriptor?.suggestedFix,
  };
}

function allowDecision(): PolicyDecision {
  return {
    action: "allow",
    risk: "low",
    reason: "No blocking policy rule matched.",
  };
}

function observeDecision(policy: ToolLatchPolicy, decision: PolicyDecision): PolicyDecision {
  if (policy.mode !== "observe" || decision.action === "allow") {
    return decision;
  }

  return {
    ...decision,
    action: "allow",
    reason: `Observe mode would have ${decision.action}ed this call: ${decision.reason}`,
  };
}

function normalizePolicyPathPattern(pattern: string, cwd: string, homeDir: string): string {
  if (pattern.includes("*")) {
    if (pattern.startsWith("**/")) {
      return normalizeSlashes(pattern);
    }
    const expanded = pattern.startsWith("~") ? normalizePathForMatch(pattern, cwd, homeDir) : pattern;
    if (expanded.startsWith(".") || !path.isAbsolute(expanded.replace(/\*/g, "x"))) {
      return normalizeSlashes(path.resolve(cwd, expanded));
    }
    return normalizeSlashes(expanded);
  }
  return normalizePathForMatch(pattern, cwd, homeDir);
}

function matchPath(candidate: string, pattern: string): boolean {
  const normalizedCandidate = normalizeSlashes(candidate);
  const normalizedPattern = normalizeSlashes(pattern);
  return micromatch.isMatch(normalizedCandidate, normalizedPattern, { dot: true, nocase: process.platform === "win32" });
}

export function matchCommand(command: string, pattern: string): boolean {
  return matchShellPattern(command, pattern);
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item));
  }

  return [];
}

function visitArguments(
  value: Record<string, unknown>,
  visitor: (key: string, value: unknown) => void,
): void {
  for (const [key, item] of Object.entries(value)) {
    visitor(key, item);
    if (Array.isArray(item)) {
      for (const child of item) {
        if (typeof child === "object" && child !== null) {
          visitArguments(ensureRecord(child), visitor);
        }
      }
    } else if (typeof item === "object" && item !== null) {
      visitArguments(ensureRecord(item), visitor);
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
