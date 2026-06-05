import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import { isRecord, redactValue, type RiskLevel, type ToolCapability } from "@mcp-toollatch/core";
import { classifyServerRisk } from "@mcp-toollatch/rules";

export type ClientId = "cursor" | "claude-desktop" | "vscode";
export type ConfigStatus = "found" | "missing" | "invalid" | "unreadable";

export interface ScannerOptions {
  homeDir?: string;
  appDataDir?: string;
  platform?: NodeJS.Platform;
  clients?: ClientId[];
  configPaths?: Partial<Record<ClientId, string[]>>;
}

export interface ClientConfigCandidate {
  client: ClientId;
  displayName: string;
  path: string;
}

export interface NormalizedServerConfig {
  client: ClientId;
  clientName: string;
  configPath: string;
  name: string;
  command?: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
  envSummary: Record<string, string>;
  riskLevel: RiskLevel;
  capabilities: ToolCapability[];
  warnings: string[];
}

export interface ClientScanResult {
  client: ClientId;
  clientName: string;
  configPath: string;
  status: ConfigStatus;
  servers: NormalizedServerConfig[];
  error?: string;
}

export interface ScanReport {
  generatedAt: string;
  clients: ClientScanResult[];
  servers: NormalizedServerConfig[];
}

const clientNames: Record<ClientId, string> = {
  cursor: "Cursor",
  "claude-desktop": "Claude Desktop",
  vscode: "VS Code",
};

export async function scanMcpConfigs(options: ScannerOptions = {}): Promise<ScanReport> {
  const candidates = getClientConfigCandidates(options).filter((candidate) => {
    return options.clients === undefined || options.clients.includes(candidate.client);
  });

  const clients: ClientScanResult[] = [];

  for (const candidate of candidates) {
    clients.push(await scanCandidate(candidate));
  }

  const dedupedClients = dedupeClientResults(clients);
  return {
    generatedAt: new Date().toISOString(),
    clients: dedupedClients,
    servers: dedupedClients.flatMap((client) => client.servers),
  };
}

export function getClientConfigCandidates(options: ScannerOptions = {}): ClientConfigCandidate[] {
  const homeDir = options.homeDir ?? os.homedir();
  const platform = options.platform ?? process.platform;
  const appDataDir = options.appDataDir ?? process.env.APPDATA ?? path.join(homeDir, "AppData", "Roaming");
  const candidates: ClientConfigCandidate[] = [];

  const add = (client: ClientId, paths: string[]): void => {
    const overridden = options.configPaths?.[client];
    for (const item of overridden ?? paths) {
      candidates.push({
        client,
        displayName: clientNames[client],
        path: path.resolve(expandHome(item, homeDir)),
      });
    }
  };

  add("cursor", [
    path.join(homeDir, ".cursor", "mcp.json"),
    platform === "darwin"
      ? path.join(homeDir, "Library", "Application Support", "Cursor", "User", "mcp.json")
      : path.join(appDataDir, "Cursor", "User", "mcp.json"),
    platform === "darwin"
      ? path.join(homeDir, "Library", "Application Support", "Cursor", "User", "settings.json")
      : path.join(appDataDir, "Cursor", "User", "settings.json"),
  ]);

  add("claude-desktop", [
    platform === "darwin"
      ? path.join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json")
      : path.join(appDataDir, "Claude", "claude_desktop_config.json"),
  ]);

  add("vscode", [
    platform === "darwin"
      ? path.join(homeDir, "Library", "Application Support", "Code", "User", "settings.json")
      : path.join(appDataDir, "Code", "User", "settings.json"),
    path.join(homeDir, ".vscode", "mcp.json"),
  ]);

  return candidates;
}

export function parseMcpServersFromConfig(
  config: unknown,
  client: ClientId,
  clientName: string,
  configPath: string,
): NormalizedServerConfig[] {
  const root = isRecord(config) ? config : {};
  const serverContainer =
    findRecord(root, ["mcpServers"]) ??
    findRecord(root, ["mcp", "servers"]) ??
    findRecord(root, ["servers"]) ??
    findRecord(root, ["mcp.servers"]);

  if (serverContainer === undefined) {
    return [];
  }

  return Object.entries(serverContainer).flatMap(([name, value]) => {
    if (!isRecord(value)) {
      return [];
    }

    const command = typeof value.command === "string" ? value.command : undefined;
    const args = Array.isArray(value.args) ? value.args.filter((item): item is string => typeof item === "string") : [];
    const cwd = typeof value.cwd === "string" ? value.cwd : undefined;
    const env = normalizeEnv(value.env);
    const risk = classifyServerRisk({ name, command, args });

    return [
      {
        client,
        clientName,
        configPath,
        name,
        command,
        args,
        cwd,
        env,
        envSummary: summarizeEnv(env),
        riskLevel: risk.level,
        capabilities: risk.capabilities,
        warnings: [
          ...risk.warnings,
          ...(command === undefined ? ["Server command is missing."] : []),
          ...riskWarningsFromCommand(command, args),
        ],
      },
    ];
  });
}

export function summarizeScanReport(report: ScanReport): string {
  const lines = [`MCP ToolLatch scan report (${report.generatedAt})`, ""];

  for (const client of report.clients) {
    lines.push(`${client.clientName}: ${client.status}`);
    lines.push(`  config: ${client.configPath}`);

    if (client.error !== undefined) {
      lines.push(`  error: ${client.error}`);
    }

    if (client.servers.length === 0) {
      lines.push("  servers: none");
    }

    for (const server of client.servers) {
      lines.push(
        `  - ${server.name}: ${server.riskLevel.toUpperCase()} [${server.capabilities.join(", ")}]`,
      );
      lines.push(`    command: ${server.command ?? "(missing)"} ${server.args.join(" ")}`.trimEnd());
      if (Object.keys(server.envSummary).length > 0) {
        lines.push(`    env: ${JSON.stringify(server.envSummary)}`);
      }
      for (const warning of server.warnings) {
        lines.push(`    warning: ${warning}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

async function scanCandidate(candidate: ClientConfigCandidate): Promise<ClientScanResult> {
  let content: string;
  try {
    content = await fs.readFile(candidate.path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return baseClientResult(candidate, "missing");
    }
    return baseClientResult(candidate, "unreadable", formatError(error));
  }

  const errors: ParseError[] = [];
  const parsed = parse(content, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const formatted = errors
      .map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`)
      .join("; ");
    return baseClientResult(candidate, "invalid", formatted);
  }

  return {
    ...baseClientResult(candidate, "found"),
    servers: parseMcpServersFromConfig(parsed, candidate.client, candidate.displayName, candidate.path),
  };
}

function baseClientResult(
  candidate: ClientConfigCandidate,
  status: ConfigStatus,
  error?: string,
): ClientScanResult {
  return {
    client: candidate.client,
    clientName: candidate.displayName,
    configPath: candidate.path,
    status,
    servers: [],
    error,
  };
}

function dedupeClientResults(results: ClientScanResult[]): ClientScanResult[] {
  const byClient = new Map<ClientId, ClientScanResult[]>();
  for (const result of results) {
    byClient.set(result.client, [...(byClient.get(result.client) ?? []), result]);
  }

  return [...byClient.entries()].flatMap(([, clientResults]) => {
    const found = clientResults.filter((result) => result.status === "found");
    return found.length > 0 ? found : [clientResults[0]].filter((item): item is ClientScanResult => item !== undefined);
  });
}

function findRecord(root: Record<string, unknown>, pathParts: string[]): Record<string, unknown> | undefined {
  let current: unknown = root;
  for (const part of pathParts) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return isRecord(current) ? current : undefined;
}

function normalizeEnv(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, item]) => [key, item]),
  );
}

function summarizeEnv(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [
      key,
      /(?:token|secret|password|api[_-]?key|authorization|cookie|key)/i.test(key)
        ? String(redactValue(value))
        : value,
    ]),
  );
}

function riskWarningsFromCommand(command: string | undefined, args: string[]): string[] {
  const value = [command ?? "", ...args].join(" ");
  const warnings: string[] = [];
  if (/\bsudo\b|\brm\s+-rf\b|curl\b.*\|\s*sh|wget\b.*\|\s*sh/i.test(value)) {
    warnings.push("Server command contains dangerous shell patterns.");
  }
  if (/\btoken=|api[_-]?key=|password=/i.test(value)) {
    warnings.push("Server args may contain inline secrets.");
  }
  return warnings;
}

function expandHome(value: string, homeDir: string): string {
  if (value === "~") {
    return homeDir;
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(homeDir, value.slice(2));
  }
  return value;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
