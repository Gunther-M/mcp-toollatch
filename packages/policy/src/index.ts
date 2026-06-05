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
  defaultSensitivePathPatterns,
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
      })
      .default({}),
    rules: z.array(policyRuleSchema).default([]),
  })
  .strict();

export type PolicyAction = z.infer<typeof policyActionSchema>;
export type PolicyMode = z.infer<typeof policyModeSchema>;
export type PolicyRule = z.infer<typeof policyRuleSchema>;
export type ToolLatchPolicy = z.infer<typeof policySchema>;

export interface ExtractedToolArguments {
  paths: string[];
  commands: string[];
  urls: string[];
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
}

export interface InitPolicyResult {
  filePath: string;
  created: boolean;
  policy: ToolLatchPolicy;
}

export function createDefaultPolicy(): ToolLatchPolicy {
  return policySchema.parse({
    version: 1,
    mode: "enforce",
    defaults: {
      unknown_tool: "confirm",
      log_all_calls: true,
      non_interactive_confirm: "deny",
    },
    audit: {
      enabled: true,
      path: defaultAuditLogPath,
    },
    rules: [
      {
        id: "RULE-001",
        description: "Block sensitive file access.",
        severity: "critical",
        match: { category: "filesystem" },
        deny_paths: [...defaultSensitivePathPatterns],
        action: "block",
        suggested_fix: "Move secrets outside MCP-accessible paths or add a narrow allow rule for non-secret files.",
      },
      {
        id: "RULE-003",
        description: "Keep default filesystem reads inside common project folders.",
        severity: "high",
        match: { category: "filesystem" },
        allow_paths: [...defaultAllowedPathPatterns],
        action: "allow",
      },
      {
        id: "RULE-004",
        description: "Block dangerous shell commands.",
        severity: "critical",
        match: { category: "shell" },
        deny_commands: [...defaultDangerousCommandPatterns],
        action: "block",
        suggested_fix: "Review and run dangerous commands manually outside the MCP session.",
      },
      {
        id: "RULE-005",
        description: "Require confirmation for high impact shell commands.",
        severity: "high",
        match: { category: "shell" },
        deny_commands: [...defaultConfirmCommandPatterns],
        require_confirm: true,
        action: "confirm",
        suggested_fix: "Confirm only after checking the target environment and command arguments.",
      },
      {
        id: "RULE-010",
        description: "Unknown tools require confirmation by default.",
        severity: "medium",
        match: { category: "unknown" },
        require_confirm: true,
        action: "confirm",
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

  if (!options.force && (await fileExists(filePath))) {
    throw new AppError(
      "FILE_EXISTS",
      `Policy file already exists: ${filePath}. Use --force to overwrite it.`,
    );
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, createDefaultPolicyYaml(), "utf8");

  return {
    filePath,
    created: true,
    policy: createDefaultPolicy(),
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
    return pathDecision;
  }

  const commandDecision = evaluateCommandRules(policy, extracted.commands, category);
  if (commandDecision.action !== "allow") {
    if (commandDecision.action === "confirm" && context.isInteractive === false) {
      return {
        ...commandDecision,
        action: policy.defaults.non_interactive_confirm === "allow" ? "allow" : "block",
        reason: `${commandDecision.reason} Non-interactive sessions deny confirmation by default.`,
        matchedRuleId: commandDecision.matchedRuleId ?? "RULE-013",
      };
    }
    return commandDecision;
  }

  const genericDecision = evaluateGenericRules(policy, category, extracted);
  if (genericDecision.action === "confirm" && context.isInteractive === false) {
    return {
      ...genericDecision,
      action: policy.defaults.non_interactive_confirm === "allow" ? "allow" : "block",
      reason: `${genericDecision.reason} Non-interactive sessions deny confirmation by default.`,
      matchedRuleId: genericDecision.matchedRuleId ?? "RULE-013",
    };
  }

  return genericDecision;
}

export function extractToolArguments(
  toolName: string,
  args: Record<string, unknown>,
): ExtractedToolArguments {
  const paths = new Set<string>();
  const commands = new Set<string>();
  const urls = new Set<string>();
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
      collectStrings(value).forEach((item) => urls.add(item));
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
    direct.forEach((item) => commands.add(item));
  }

  return {
    paths: [...paths],
    commands: [...commands],
    urls: [...urls],
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
        return makeDecision("block", rule.severity, rule, `Path is denied by policy: ${matched}`);
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
      return makeDecision(
        "confirm",
        "high",
        {
          id: "RULE-003",
          description: "Path is outside configured allow_paths.",
          severity: "high",
          match: { category },
          action: "confirm",
          allow_paths: [],
          deny_paths: [],
          deny_commands: [],
          require_confirm: true,
          suggested_fix: "Add a narrow allow_paths entry if this location is expected.",
        },
        `Path is outside allow_paths: ${outside}`,
      );
    }
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
        return makeDecision(action, rule.severity, rule, `Command matched policy pattern "${pattern}": ${matched}`);
      }
    }

    if (rule.require_confirm) {
      return makeDecision("confirm", rule.severity, rule, "Command requires confirmation by policy.");
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
      matchedRuleId: "RULE-010",
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

function makeDecision(
  action: PolicyDecisionAction,
  risk: RiskLevel,
  rule: PolicyRule,
  reason: string,
): PolicyDecision {
  const descriptor = builtInRiskRules.find((item) => item.id === rule.id);
  return {
    action,
    risk,
    reason,
    matchedRuleId: rule.id,
    matchedRuleTitle: descriptor?.title ?? rule.description,
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
  const normalizedCommand = command.replace(/\s+/g, " ").trim().toLowerCase();
  const normalizedPattern = pattern.replace(/\s+/g, " ").trim().toLowerCase();

  if (normalizedPattern.includes("*")) {
    const regex = new RegExp(
      `^${normalizedPattern
        .split("*")
        .map((part) => escapeRegex(part))
        .join(".*")}`,
      "i",
    );
    return regex.test(normalizedCommand);
  }

  return normalizedCommand.includes(normalizedPattern);
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
