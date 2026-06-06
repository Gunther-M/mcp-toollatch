import { domainToASCII } from "node:url";
import type { RiskLevel, ToolCapability } from "@mcp-toollatch/core";

export type RuleCategory =
  | "filesystem"
  | "shell"
  | "network"
  | "database"
  | "metadata"
  | "audit"
  | "unknown";

export interface RiskRuleDescriptor {
  id: string;
  category: RuleCategory;
  title: string;
  severity: RiskLevel;
  description: string;
  suggestedFix: string;
  source: "builtin";
}

export interface ClassifiedRisk {
  level: RiskLevel;
  capabilities: ToolCapability[];
  warnings: string[];
}

export const defaultSensitivePathPatterns = [
  ".env",
  ".env.*",
  "**/.env",
  "**/.env.*",
  "~/.ssh/**",
  "**/.ssh/**",
  "~/.aws/**",
  "**/.aws/**",
  "~/.config/**",
  "**/.config/**",
  "**/*.pem",
  "**/*.key",
  "**/*.crt",
  "**/*.p12",
  "**/*.pfx",
  "**/id_rsa",
] as const;

export const defaultAllowedPathPatterns = ["./src/**", "./docs/**", "./examples/**"] as const;

export const defaultDangerousCommandPatterns = [
  "rm -rf",
  "sudo",
  "curl * | sh",
  "wget * | sh",
  "iwr * | iex",
  "irm * | iex",
  "powershell * iex",
  "pwsh * iex",
  "chmod 777",
  "dd if=",
  "mkfs",
  ":(){:|:&};:",
] as const;

export const defaultConfirmCommandPatterns = [
  "git push",
  "npm publish",
  "docker rm",
  "kubectl delete",
  "terraform apply",
] as const;

export const defaultDeniedDomainPatterns = ["169.254.169.254"] as const;

export const builtInRiskRules: RiskRuleDescriptor[] = [
  {
    id: "RULE-PATH-001",
    category: "filesystem",
    title: "Sensitive file access",
    severity: "critical",
    description: "Sensitive paths often contain API keys, database passwords, private keys, or login credentials.",
    suggestedFix: "Use a narrower allow path or move secrets outside MCP-accessible paths.",
    source: "builtin",
  },
  {
    id: "RULE-PATH-ALLOW-001",
    category: "filesystem",
    title: "Path outside allowlist",
    severity: "high",
    description: "The requested path is outside configured allow_paths.",
    suggestedFix: "Add a narrow allow_paths entry if this location is expected.",
    source: "builtin",
  },
  {
    id: "RULE-CMD-001",
    category: "shell",
    title: "Dangerous shell command",
    severity: "critical",
    description: "This command may delete files, escalate privileges, download and execute code, or damage the system.",
    suggestedFix: "Run the command manually after reviewing it, or rewrite it as a safer explicit operation.",
    source: "builtin",
  },
  {
    id: "RULE-CMD-ALLOW-001",
    category: "shell",
    title: "Safe shell allowlist",
    severity: "low",
    description: "This shell command matched an explicit safe allowlist entry.",
    suggestedFix: "Keep allowlist patterns narrow and prefer exact commands.",
    source: "builtin",
  },
  {
    id: "RULE-CMD-CONFIRM-001",
    category: "shell",
    title: "High impact command",
    severity: "high",
    description: "This command may change remote state, production resources, or published packages.",
    suggestedFix: "Confirm only after verifying the command target and arguments.",
    source: "builtin",
  },
  {
    id: "RULE-NET-001",
    category: "network",
    title: "Denied domain",
    severity: "critical",
    description: "The requested network destination matches a denied domain policy.",
    suggestedFix: "Remove the destination or review the policy before allowing this domain.",
    source: "builtin",
  },
  {
    id: "RULE-NET-002",
    category: "network",
    title: "Unlisted domain",
    severity: "high",
    description: "The requested network destination is not in the configured allow_domains list.",
    suggestedFix: "Add a narrow allow_domains entry only after reviewing the destination.",
    source: "builtin",
  },
  {
    id: "RULE-META-001",
    category: "metadata",
    title: "Suspicious tool description",
    severity: "medium",
    description: "Tool metadata contains wording associated with hidden instructions or data exfiltration.",
    suggestedFix: "Review the MCP server source and tool schema before trusting it.",
    source: "builtin",
  },
  {
    id: "RULE-UNKNOWN-001",
    category: "unknown",
    title: "Unknown tool with sensitive arguments",
    severity: "medium",
    description: "Unknown tools that receive paths, commands, URLs, SQL, or content should not be silently trusted.",
    suggestedFix: "Add an explicit policy rule once you understand the server behavior.",
    source: "builtin",
  },
  {
    id: "RULE-AUDIT-001",
    category: "audit",
    title: "Sensitive audit redaction",
    severity: "critical",
    description: "Audit logs and exports must not expose obvious secrets.",
    suggestedFix: "Keep audit exports redacted when sharing trial feedback.",
    source: "builtin",
  },
] as const;

const capabilityKeywords: Array<{ capability: ToolCapability; level: RiskLevel; patterns: RegExp[] }> = [
  {
    capability: "shell",
    level: "critical",
    patterns: [/\bshell\b/i, /\bexec(?:ute)?\b/i, /\bterminal\b/i, /\bcommand\b/i, /\bbash\b/i],
  },
  {
    capability: "filesystem",
    level: "high",
    patterns: [/\bfile(?:system)?\b/i, /\bread_file\b/i, /\bwrite_file\b/i, /\blist_dir\b/i, /\bfs\b/i],
  },
  {
    capability: "database",
    level: "high",
    patterns: [/\bsql\b/i, /\bpostgres\b/i, /\bmysql\b/i, /\bsqlite\b/i, /\bdatabase\b/i],
  },
  {
    capability: "network",
    level: "medium",
    patterns: [/\bhttp\b/i, /\bfetch\b/i, /\burl\b/i, /\bnetwork\b/i, /\bapi\b/i, /\bweb\b/i],
  },
  {
    capability: "git",
    level: "medium",
    patterns: [/\bgit\b/i],
  },
  {
    capability: "github",
    level: "medium",
    patterns: [/\bgithub\b/i, /\bgh\b/i],
  },
];

const suspiciousDescriptionPatterns = [
  /ignore (all )?(previous|prior) instructions/i,
  /leak secrets?/i,
  /system prompt/i,
  /send secrets?/i,
  /exfiltrat/i,
  /hidden instruction/i,
  /hidden system prompt/i,
  /base64\s+(?:blob|payload|encoded)/i,
  /private keys?/i,
];

const riskRank: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function maxRisk(left: RiskLevel, right: RiskLevel): RiskLevel {
  return riskRank[left] >= riskRank[right] ? left : right;
}

export function classifyServerRisk(input: {
  name: string;
  command?: string;
  args?: string[];
  tools?: Array<{ name: string; description?: string }>;
}): ClassifiedRisk {
  const haystack = [
    input.name,
    input.command ?? "",
    ...(input.args ?? []),
    ...(input.tools ?? []).flatMap((tool) => [tool.name, tool.description ?? ""]),
  ].join(" ");

  const capabilities = new Set<ToolCapability>();
  const warnings: string[] = [];
  let level: RiskLevel = "low";

  for (const keyword of capabilityKeywords) {
    if (keyword.patterns.some((pattern) => pattern.test(haystack))) {
      capabilities.add(keyword.capability);
      level = maxRisk(level, keyword.level);
    }
  }

  if (suspiciousDescriptionPatterns.some((pattern) => pattern.test(haystack))) {
    warnings.push("RULE-META-001: Tool metadata contains suspicious instruction-like wording.");
    level = maxRisk(level, "medium");
  }

  if (capabilities.size === 0) {
    capabilities.add("unknown");
    level = "medium";
    warnings.push("No known capability matched; review this server manually.");
  }

  return {
    level,
    capabilities: [...capabilities],
    warnings,
  };
}

export function classifyToolName(toolName: string): ToolCapability {
  return classifyServerRisk({ name: toolName }).capabilities[0] ?? "unknown";
}

export function matchShellPattern(command: string, pattern: string): boolean {
  const normalizedCommand = normalizeCommand(command);
  const normalizedPattern = normalizeCommand(pattern);

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

export function matchSafeShellPattern(command: string, pattern: string): boolean {
  const normalizedCommand = normalizeCommand(command);
  const normalizedPattern = normalizeCommand(pattern);
  if (/[;&|`$<>]/.test(normalizedCommand)) {
    return false;
  }

  if (normalizedPattern.includes("*")) {
    const regex = new RegExp(
      `^${normalizedPattern
        .split("*")
        .map((part) => escapeRegex(part))
        .join(".*")}$`,
      "i",
    );
    return regex.test(normalizedCommand);
  }

  return normalizedCommand === normalizedPattern;
}

export function extractDomainsFromText(value: string): string[] {
  const domains = new Set<string>();
  const urlMatches = value.matchAll(/\bhttps?:\/\/[^\s"'<>`|)]+/gi);
  for (const match of urlMatches) {
    const domain = domainFromUrl(match[0]);
    if (domain !== undefined) {
      domains.add(domain);
    }
  }

  return [...domains];
}

export function normalizeDomain(value: string): string | undefined {
  const trimmed = value.trim().replace(/\.$/, "");
  if (trimmed.length === 0) {
    return undefined;
  }

  const withoutScheme = trimmed.includes("://") ? domainFromUrl(trimmed) : trimmed;
  if (withoutScheme === undefined) {
    return undefined;
  }

  const withoutPort = withoutScheme.startsWith("[")
    ? withoutScheme
    : withoutScheme.split("/")[0]?.split(":")[0] ?? "";
  const ascii = domainToASCII(withoutPort.toLowerCase());
  return ascii.length > 0 ? ascii : undefined;
}

export function matchDomainPattern(domain: string, pattern: string): boolean {
  const normalizedDomain = normalizeDomain(domain);
  const normalizedPattern = normalizeDomain(pattern.replace(/^\*\./, ""));
  if (normalizedDomain === undefined || normalizedPattern === undefined) {
    return false;
  }

  if (pattern.trim().startsWith("*.")) {
    return normalizedDomain === normalizedPattern || normalizedDomain.endsWith(`.${normalizedPattern}`);
  }

  return normalizedDomain === normalizedPattern;
}

function domainFromUrl(value: string): string | undefined {
  try {
    return normalizeDomain(new URL(value).hostname);
  } catch {
    return undefined;
  }
}

function normalizeCommand(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
