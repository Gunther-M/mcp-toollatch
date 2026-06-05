import type { RiskLevel, ToolCapability } from "@mcp-toollatch/core";

export interface RiskRuleDescriptor {
  id: string;
  title: string;
  severity: RiskLevel;
  description: string;
  suggestedFix: string;
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
  "~/.aws/**",
  "~/.config/**",
  "**/*.pem",
  "**/*.key",
  "**/*.crt",
  "**/*.p12",
  "**/*.pfx",
] as const;

export const defaultAllowedPathPatterns = ["./src/**", "./docs/**", "./examples/**"] as const;

export const defaultDangerousCommandPatterns = [
  "rm -rf",
  "sudo",
  "curl * | sh",
  "wget * | sh",
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

export const builtInRiskRules: RiskRuleDescriptor[] = [
  {
    id: "RULE-001",
    title: "Sensitive file access",
    severity: "critical",
    description: "Sensitive paths often contain API keys, database passwords, private keys, or login credentials.",
    suggestedFix: "Use a narrower allow path or move secrets outside MCP-accessible paths.",
  },
  {
    id: "RULE-004",
    title: "Dangerous shell command",
    severity: "critical",
    description: "This command may delete files, escalate privileges, download and execute code, or damage the system.",
    suggestedFix: "Run the command manually after reviewing it, or rewrite it as a safer explicit operation.",
  },
  {
    id: "RULE-005",
    title: "High impact command",
    severity: "high",
    description: "This command may change remote state, production resources, or published packages.",
    suggestedFix: "Confirm only after verifying the command target and arguments.",
  },
  {
    id: "RULE-009",
    title: "Suspicious tool description",
    severity: "medium",
    description: "Tool metadata contains wording associated with hidden instructions or data exfiltration.",
    suggestedFix: "Review the MCP server source and tool schema before trusting it.",
  },
  {
    id: "RULE-010",
    title: "Unknown tool with sensitive arguments",
    severity: "medium",
    description: "Unknown tools that receive paths, commands, URLs, SQL, or content should not be silently trusted.",
    suggestedFix: "Add an explicit policy rule once you understand the server behavior.",
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
  /system prompt/i,
  /send secrets?/i,
  /exfiltrat/i,
  /hidden instruction/i,
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
    warnings.push("Tool metadata contains suspicious instruction-like wording.");
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
