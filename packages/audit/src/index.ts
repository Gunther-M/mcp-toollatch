import fs from "node:fs/promises";
import path from "node:path";
import {
  redactObject,
  summarizeArguments,
  type PolicyDecisionAction,
  type RiskLevel,
  type ToolCallRequest,
} from "@mcp-toollatch/core";

export interface AuditEvent {
  version: 1;
  id: string;
  timestamp: string;
  server: string;
  tool: string;
  requestId?: string | number;
  argumentsSummary: string;
  redactedArguments: unknown;
  decision: PolicyDecisionAction;
  risk: RiskLevel;
  reason: string;
  matchedRuleId?: string;
  durationMs?: number;
}

export interface CreateAuditEventInput {
  request: ToolCallRequest;
  decision: {
    action: PolicyDecisionAction;
    risk: RiskLevel;
    reason: string;
    matchedRuleId?: string;
  };
  startedAt?: number;
}

export interface AuditQuery {
  limit?: number;
  server?: string;
  tool?: string;
  decision?: PolicyDecisionAction;
  since?: Date;
}

export type AuditExportFormat = "json" | "csv";

export const defaultAuditModule = {
  name: "audit",
  purpose: "Record local audit events for MCP tool-call decisions.",
} as const;

export function createAuditEvent(input: CreateAuditEventInput): AuditEvent {
  const now = Date.now();
  const redactedArguments = redactObject(input.request.arguments);
  return {
    version: 1,
    id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: new Date(now).toISOString(),
    server: input.request.serverName,
    tool: input.request.toolName,
    requestId: input.request.requestId,
    argumentsSummary: summarizeArguments(input.request.arguments),
    redactedArguments,
    decision: input.decision.action,
    risk: input.decision.risk,
    reason: input.decision.reason,
    matchedRuleId: input.decision.matchedRuleId,
    durationMs: input.startedAt === undefined ? undefined : now - input.startedAt,
  };
}

export async function appendAuditEvent(filePath: string, event: AuditEvent): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
}

export async function recordAuditEvent(
  filePath: string,
  input: CreateAuditEventInput,
): Promise<AuditEvent> {
  const event = createAuditEvent(input);
  await appendAuditEvent(filePath, event);
  return event;
}

export async function readAuditEvents(filePath: string, query: AuditQuery = {}): Promise<AuditEvent[]> {
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const parsed = content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        return [parseAuditEvent(JSON.parse(stripBom(line)))];
      } catch {
        return [];
      }
    })
    .filter((event) => matchesQuery(event, query));

  const limit = query.limit ?? 50;
  return parsed.slice(Math.max(0, parsed.length - limit)).reverse();
}

export function parseAuditEvent(value: unknown): AuditEvent {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid audit event");
  }

  const event = value as Partial<AuditEvent>;
  if (
    typeof event.id !== "string" ||
    typeof event.timestamp !== "string" ||
    typeof event.server !== "string" ||
    typeof event.tool !== "string" ||
    typeof event.argumentsSummary !== "string" ||
    !isDecision(event.decision) ||
    !isRisk(event.risk) ||
    typeof event.reason !== "string"
  ) {
    throw new Error("Invalid audit event");
  }

  return {
    version: 1,
    id: event.id,
    timestamp: event.timestamp,
    server: event.server,
    tool: event.tool,
    requestId: event.requestId,
    argumentsSummary: event.argumentsSummary,
    redactedArguments: event.redactedArguments,
    decision: event.decision,
    risk: event.risk,
    reason: event.reason,
    matchedRuleId: event.matchedRuleId,
    durationMs: event.durationMs,
  };
}

export async function exportAuditEvents(input: {
  logFilePath: string;
  outFilePath: string;
  format: AuditExportFormat;
  query?: AuditQuery;
}): Promise<{ outFilePath: string; count: number; format: AuditExportFormat }> {
  const events = await readAuditEvents(input.logFilePath, input.query);
  const content =
    input.format === "json"
      ? `${JSON.stringify(events, null, 2)}\n`
      : toCsv(events);
  await fs.mkdir(path.dirname(input.outFilePath), { recursive: true });
  await fs.writeFile(input.outFilePath, content, "utf8");
  return {
    outFilePath: input.outFilePath,
    count: events.length,
    format: input.format,
  };
}

function matchesQuery(event: AuditEvent, query: AuditQuery): boolean {
  if (query.server !== undefined && event.server !== query.server) {
    return false;
  }

  if (query.tool !== undefined && event.tool !== query.tool) {
    return false;
  }

  if (query.decision !== undefined && event.decision !== query.decision) {
    return false;
  }

  if (query.since !== undefined && Date.parse(event.timestamp) < query.since.getTime()) {
    return false;
  }

  return true;
}

function toCsv(events: AuditEvent[]): string {
  const header = [
    "timestamp",
    "server",
    "tool",
    "decision",
    "risk",
    "matchedRuleId",
    "reason",
    "argumentsSummary",
  ];
  const rows = events.map((event) =>
    [
      event.timestamp,
      event.server,
      event.tool,
      event.decision,
      event.risk,
      event.matchedRuleId ?? "",
      event.reason,
      event.argumentsSummary,
    ]
      .map(csvCell)
      .join(","),
  );
  return `${header.join(",")}\n${rows.join("\n")}${rows.length === 0 ? "" : "\n"}`;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function isDecision(value: unknown): value is PolicyDecisionAction {
  return value === "allow" || value === "block" || value === "confirm";
}

function isRisk(value: unknown): value is RiskLevel {
  return value === "low" || value === "medium" || value === "high" || value === "critical";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
