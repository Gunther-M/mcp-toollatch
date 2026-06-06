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
  matchedRuleTitle?: string;
  matchedValue?: string;
  suggestedFix?: string;
  durationMs?: number;
}

export interface CreateAuditEventInput {
  request: ToolCallRequest;
  decision: {
    action: PolicyDecisionAction;
    risk: RiskLevel;
    reason: string;
    matchedRuleId?: string;
    matchedRuleTitle?: string;
    matchedValue?: string;
    suggestedFix?: string;
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

export interface AuditRotationOptions {
  maxFileSizeMb?: number;
  maxFiles?: number;
}

export type AuditExportFormat = "json" | "csv" | "md";

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
    matchedRuleTitle: input.decision.matchedRuleTitle,
    matchedValue: input.decision.matchedValue,
    suggestedFix: input.decision.suggestedFix,
    durationMs: input.startedAt === undefined ? undefined : now - input.startedAt,
  };
}

export async function appendAuditEvent(
  filePath: string,
  event: AuditEvent,
  rotation: AuditRotationOptions = {},
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const line = `${JSON.stringify(event)}\n`;
  await rotateAuditLogIfNeeded(filePath, Buffer.byteLength(line, "utf8"), rotation);
  await fs.appendFile(filePath, line, "utf8");
}

export async function recordAuditEvent(
  filePath: string,
  input: CreateAuditEventInput,
  rotation: AuditRotationOptions = {},
): Promise<AuditEvent> {
  const event = createAuditEvent(input);
  await appendAuditEvent(filePath, event, rotation);
  return event;
}

export async function readAuditEvents(filePath: string, query: AuditQuery = {}): Promise<AuditEvent[]> {
  const files = await listAuditLogFiles(filePath);
  const parsed = (
    await Promise.all(
      files.map(async (file) => {
        const content = await fs.readFile(file, "utf8");
        return content
          .split(/\r?\n/)
          .filter((line) => line.trim().length > 0)
          .flatMap((line) => {
            try {
              return [parseAuditEvent(JSON.parse(stripBom(line)))];
            } catch {
              return [];
            }
          });
      }),
    )
  )
    .flat()
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
    matchedRuleTitle: event.matchedRuleTitle,
    matchedValue: event.matchedValue,
    suggestedFix: event.suggestedFix,
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
    input.format === "json" ? `${JSON.stringify(events, null, 2)}\n` : input.format === "csv" ? toCsv(events) : toMarkdown(events);
  await fs.mkdir(path.dirname(input.outFilePath), { recursive: true });
  await fs.writeFile(input.outFilePath, content, "utf8");
  return {
    outFilePath: input.outFilePath,
    count: events.length,
    format: input.format,
  };
}

export async function listAuditLogFiles(filePath: string): Promise<string[]> {
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath);

  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const activeExists = names.includes(baseName);
  const rotated = names
    .map((name) => {
      const match = new RegExp(`^${escapeRegex(baseName)}\\.(\\d+)$`).exec(name);
      return match?.[1] === undefined ? undefined : { name, index: Number.parseInt(match[1], 10) };
    })
    .filter((item): item is { name: string; index: number } => item !== undefined)
    .sort((left, right) => right.index - left.index)
    .map((item) => path.join(dir, item.name));

  return [...rotated, ...(activeExists ? [filePath] : [])];
}

async function rotateAuditLogIfNeeded(
  filePath: string,
  incomingBytes: number,
  rotation: AuditRotationOptions,
): Promise<void> {
  if (rotation.maxFileSizeMb === undefined) {
    return;
  }

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  const maxBytes = Math.max(1, Math.floor(rotation.maxFileSizeMb * 1024 * 1024));
  if (stat.size + incomingBytes <= maxBytes) {
    return;
  }

  const maxFiles = Math.max(1, rotation.maxFiles ?? 5);
  if (maxFiles <= 1) {
    await removeIfExists(filePath);
    return;
  }

  await removeIfExists(`${filePath}.${maxFiles - 1}`);
  for (let index = maxFiles - 2; index >= 1; index -= 1) {
    await renameIfExists(`${filePath}.${index}`, `${filePath}.${index + 1}`);
  }
  await renameIfExists(filePath, `${filePath}.1`);
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

function toMarkdown(events: AuditEvent[]): string {
  const lines = [
    "# MCP ToolLatch Audit Export",
    "",
    "| Timestamp | Decision | Risk | Server | Tool | Rule | Reason | Arguments |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const event of events) {
    lines.push(
      [
        event.timestamp,
        event.decision,
        event.risk,
        event.server,
        event.tool,
        event.matchedRuleId ?? "",
        event.reason,
        event.argumentsSummary,
      ]
        .map(markdownCell)
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    );
  }

  return `${lines.join("\n")}\n`;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
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

async function removeIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function renameIfExists(from: string, to: string): Promise<void> {
  try {
    await fs.rename(from, to);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
