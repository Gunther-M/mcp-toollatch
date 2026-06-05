import { spawn } from "node:child_process";
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
  deep?: boolean;
  deepTimeoutMs?: number;
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
  riskScore: number;
  riskReasons: string[];
  capabilities: ToolCapability[];
  warnings: string[];
  tools?: ScannedTool[];
  deepScan?: DeepScanResult;
}

export interface ScannedTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export type DeepScanStatus = "ok" | "skipped" | "failed";

export interface DeepScanResult {
  status: DeepScanStatus;
  reason?: string;
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
    clients.push(await scanCandidate(candidate, options));
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
  const platformPath = pathForPlatform(platform);
  const candidates: ClientConfigCandidate[] = [];

  const add = (client: ClientId, paths: string[]): void => {
    const overridden = options.configPaths?.[client];
    for (const item of overridden ?? paths) {
      candidates.push({
        client,
        displayName: clientNames[client],
        path: platformPath.resolve(expandHome(item, homeDir, platformPath)),
      });
    }
  };

  add("cursor", cursorCandidatePaths(homeDir, appDataDir, platform));
  add("claude-desktop", claudeCandidatePaths(homeDir, appDataDir, platform));
  add("vscode", vscodeCandidatePaths(homeDir, appDataDir, platform));

  return candidates;
}

function cursorCandidatePaths(homeDir: string, appDataDir: string, platform: NodeJS.Platform): string[] {
  const platformPath = pathForPlatform(platform);
  const userConfigDir =
    platform === "darwin"
      ? platformPath.join(homeDir, "Library", "Application Support", "Cursor", "User")
      : platform === "win32"
        ? platformPath.join(appDataDir, "Cursor", "User")
        : platformPath.join(homeDir, ".config", "Cursor", "User");

  return [
    platformPath.join(homeDir, ".cursor", "mcp.json"),
    platformPath.join(userConfigDir, "mcp.json"),
    platformPath.join(userConfigDir, "settings.json"),
  ];
}

function claudeCandidatePaths(homeDir: string, appDataDir: string, platform: NodeJS.Platform): string[] {
  const platformPath = pathForPlatform(platform);
  const configDir =
    platform === "darwin"
      ? platformPath.join(homeDir, "Library", "Application Support", "Claude")
      : platform === "win32"
        ? platformPath.join(appDataDir, "Claude")
        : platformPath.join(homeDir, ".config", "Claude");

  return [platformPath.join(configDir, "claude_desktop_config.json")];
}

function vscodeCandidatePaths(homeDir: string, appDataDir: string, platform: NodeJS.Platform): string[] {
  const platformPath = pathForPlatform(platform);
  const userConfigDir =
    platform === "darwin"
      ? platformPath.join(homeDir, "Library", "Application Support", "Code", "User")
      : platform === "win32"
        ? platformPath.join(appDataDir, "Code", "User")
        : platformPath.join(homeDir, ".config", "Code", "User");

  return [platformPath.join(userConfigDir, "settings.json"), platformPath.join(homeDir, ".vscode", "mcp.json")];
}

function pathForPlatform(platform: NodeJS.Platform): path.PlatformPath {
  return platform === "win32" ? path.win32 : path.posix;
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
    const envSummary = summarizeEnv(env);
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
        env: envSummary,
        envSummary,
        riskLevel: risk.level,
        riskScore: riskScoreFromLevel(risk.level) + risk.capabilities.length * 5 + risk.warnings.length * 10,
        riskReasons: risk.warnings.length > 0 ? risk.warnings : [`Classified as ${risk.level} from server name/command.`],
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
        `  - ${server.name}: ${server.riskLevel.toUpperCase()} score=${server.riskScore} [${server.capabilities.join(", ")}]`,
      );
      lines.push(`    command: ${server.command ?? "(missing)"} ${server.args.join(" ")}`.trimEnd());
      if (server.deepScan !== undefined) {
        lines.push(`    deep: ${server.deepScan.status}${server.deepScan.reason === undefined ? "" : ` - ${server.deepScan.reason}`}`);
      }
      if (server.tools !== undefined && server.tools.length > 0) {
        lines.push(`    tools: ${server.tools.map((tool) => tool.name).join(", ")}`);
      }
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

async function scanCandidate(candidate: ClientConfigCandidate, options: ScannerOptions): Promise<ClientScanResult> {
  let content: string;
  try {
    content = stripBom(await fs.readFile(candidate.path, "utf8"));
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

  const servers = parseMcpServersFromConfig(parsed, candidate.client, candidate.displayName, candidate.path);
  if (options.deep === true) {
    for (const server of servers) {
      await enrichServerWithDeepScan(server, options.deepTimeoutMs ?? 3_000);
    }
  }

  return {
    ...baseClientResult(candidate, "found"),
    servers,
  };
}

export async function enrichServerWithDeepScan(
  server: NormalizedServerConfig,
  timeoutMs = 3_000,
): Promise<NormalizedServerConfig> {
  if (server.command === undefined) {
    server.deepScan = { status: "skipped", reason: "Server command is missing." };
    return server;
  }

  try {
    const tools = await probeServerTools({
      command: server.command,
      args: server.args,
      cwd: server.cwd ?? path.dirname(server.configPath),
      timeoutMs,
    });
    const risk = classifyServerRisk({ name: server.name, command: server.command, args: server.args, tools });
    server.tools = tools;
    server.capabilities = risk.capabilities;
    server.riskLevel = risk.level;
    server.riskScore = riskScoreFromLevel(risk.level) + risk.capabilities.length * 5 + risk.warnings.length * 10 + tools.length;
    server.riskReasons = risk.warnings.length > 0 ? risk.warnings : [`Deep scan discovered ${tools.length} tools.`];
    server.warnings = [...new Set([...server.warnings, ...risk.warnings])];
    server.deepScan = { status: "ok", reason: `Discovered ${tools.length} tools via initialize/tools/list.` };
  } catch (error) {
    server.deepScan = { status: "failed", reason: formatError(error) };
    server.warnings = [...server.warnings, `Deep scan failed: ${formatError(error)}`];
  }

  return server;
}

export async function probeServerTools(input: {
  command: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
}): Promise<ScannedTool[]> {
  const timeoutMs = input.timeoutMs ?? 3_000;
  return await new Promise<ScannedTool[]>((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (!child.killed) {
        child.kill();
      }
      callback();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`Deep scan timed out after ${timeoutMs}ms.`)));
    }, timeoutMs);

    child.once("error", (error) => {
      finish(() => reject(error));
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        let tools: ScannedTool[] | undefined;
        try {
          tools = parseToolsListResponse(line);
        } catch (error) {
          finish(() => reject(error));
          return;
        }
        if (tools !== undefined) {
          finish(() => resolve(tools));
          return;
        }
      }
    });

    child.once("exit", (code) => {
      if (!settled) {
        const suffix = stderr.trim().length === 0 ? "" : ` stderr: ${stderr.trim().slice(0, 240)}`;
        finish(() => reject(new Error(`Server exited before tools/list completed (code ${code ?? 0}).${suffix}`)));
      }
    });

    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
  });
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

function parseToolsListResponse(line: string): ScannedTool[] | undefined {
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    return undefined;
  }

  if (!isRecord(message) || message.id !== 2) {
    return undefined;
  }

  if (isRecord(message.error)) {
    throw new Error(typeof message.error.message === "string" ? message.error.message : "tools/list returned an error.");
  }

  const result = isRecord(message.result) ? message.result : {};
  const tools = Array.isArray(result.tools) ? result.tools : [];
  return tools.flatMap((tool): ScannedTool[] => {
    if (!isRecord(tool) || typeof tool.name !== "string") {
      return [];
    }
    return [
      {
        name: tool.name,
        description: typeof tool.description === "string" ? tool.description : undefined,
        inputSchema: tool.inputSchema,
      },
    ];
  });
}

function riskScoreFromLevel(level: RiskLevel): number {
  switch (level) {
    case "critical":
      return 90;
    case "high":
      return 70;
    case "medium":
      return 40;
    case "low":
      return 10;
  }
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

function expandHome(value: string, homeDir: string, platformPath = path): string {
  if (value === "~") {
    return homeDir;
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return platformPath.join(homeDir, value.slice(2));
  }
  return value;
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
