import path from "node:path";

export const projectMetadata = {
  name: "MCP ToolLatch",
  packageName: "mcp-toollatch",
  commandName: "toollatch",
  version: "0.3.0-beta.1",
  tagline: "Local policy, approval, and audit for MCP tool calls.",
  status: "beta",
} as const;

export type ProjectMetadata = typeof projectMetadata;

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ToolCapability =
  | "filesystem"
  | "shell"
  | "git"
  | "github"
  | "database"
  | "network"
  | "unknown";

export type PolicyDecisionAction = "allow" | "block" | "confirm";

export interface ToolCallRequest {
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
  requestId?: string | number;
}

export interface PolicyDecision {
  action: PolicyDecisionAction;
  risk: RiskLevel;
  reason: string;
  matchedRuleId?: string;
  matchedRuleTitle?: string;
  suggestedFix?: string;
}

export type ErrorCode =
  | "GENERAL_ERROR"
  | "POLICY_VIOLATION"
  | "CONFIG_INVALID"
  | "PROXY_FAILED"
  | "FILE_EXISTS"
  | "NOT_FOUND";

export const exitCodes: Record<ErrorCode, number> = {
  GENERAL_ERROR: 1,
  POLICY_VIOLATION: 2,
  CONFIG_INVALID: 3,
  PROXY_FAILED: 4,
  FILE_EXISTS: 1,
  NOT_FOUND: 1,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function ensureRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

export function expandHomePath(value: string, homeDir: string): string {
  if (value === "~") {
    return homeDir;
  }

  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(homeDir, value.slice(2));
  }

  return value;
}

export function normalizePathForMatch(value: string, baseDir: string, homeDir: string): string {
  const expanded = expandHomePath(value, homeDir);
  const absolute = path.isAbsolute(expanded) ? expanded : path.resolve(baseDir, expanded);
  return normalizeSlashes(path.normalize(absolute));
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)]),
    );
  }

  return value;
}

export const sensitiveKeyPattern =
  /(?:token|secret|password|passwd|api[_-]?key|authorization|cookie|private[_-]?key|credential)/i;

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (containsObviousSecret(value)) {
      return "[REDACTED]";
    }
    if (value.length <= 4) {
      return "[REDACTED]";
    }
    return `${value.slice(0, 3)}***`;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return "[REDACTED]";
  }

  return "[REDACTED]";
}

export function containsObviousSecret(value: string): boolean {
  return (
    /(?:token|secret|password|passwd|api[_-]?key|authorization|cookie)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{6,}/i.test(
      value,
    ) || /bearer\s+[A-Za-z0-9._~+/=-]{6,}/i.test(value)
  );
}

export function redactObject(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return "[MAX_DEPTH]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item, depth + 1));
  }

  if (typeof value === "string" && containsObviousSecret(value)) {
    return "[REDACTED]";
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKeyPattern.test(key) ? redactValue(item) : redactObject(item, depth + 1),
    ]),
  );
}

export function summarizeArguments(value: Record<string, unknown>, maxLength = 1200): string {
  const summary = stableJson(redactObject(value));
  return summary.length > maxLength ? `${summary.slice(0, maxLength)}...` : summary;
}
