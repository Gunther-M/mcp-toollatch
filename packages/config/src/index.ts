import fs from "node:fs/promises";
import path from "node:path";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import { AppError, isRecord, redactObject } from "@mcp-toollatch/core";
import { createWrappedServerConfig } from "@mcp-toollatch/proxy";
import { getClientConfigCandidates, type ClientId } from "@mcp-toollatch/scanner";

export interface ApplyConfigInput {
  client: ClientId;
  serverName: string;
  configPath?: string;
  policyPath?: string;
  write?: boolean;
  homeDir?: string;
  appDataDir?: string;
  platform?: NodeJS.Platform;
}

export interface ApplyConfigPlan {
  client: ClientId;
  serverName: string;
  configPath: string;
  changed: boolean;
  alreadyWrapped: boolean;
  backupPath?: string;
  changes: ApplyConfigChange[];
  originalConfig: string;
  updatedConfig: string;
  message: string;
}

export interface ApplyConfigChange {
  path: string;
  before: unknown;
  after: unknown;
}

export interface RestoreConfigInput {
  configPath: string;
  backupPath: string;
}

export interface RestoreConfigResult {
  configPath: string;
  backupPath: string;
  preRestoreBackupPath: string;
}

export async function createApplyConfigPlan(input: ApplyConfigInput): Promise<ApplyConfigPlan> {
  const configPath = await resolveClientConfigPath(input);
  const originalConfig = stripBom(await fs.readFile(configPath, "utf8"));
  const parsed = parseJsonConfig(originalConfig, configPath);
  const serverContainer = findServerContainer(parsed);
  const server = serverContainer[input.serverName];

  if (!isRecord(server)) {
    throw new AppError("NOT_FOUND", `Server "${input.serverName}" was not found in ${configPath}.`);
  }

  const command = typeof server.command === "string" ? server.command : undefined;
  const args = Array.isArray(server.args) ? server.args.filter((item): item is string => typeof item === "string") : [];
  if (command === undefined) {
    throw new AppError("CONFIG_INVALID", `Server "${input.serverName}" is missing a command.`);
  }

  if (isWrappedServer(server, input.serverName)) {
    return {
      client: input.client,
      serverName: input.serverName,
      configPath,
      changed: false,
      alreadyWrapped: true,
      originalConfig,
      updatedConfig: originalConfig,
      changes: [],
      message: `Server "${input.serverName}" is already wrapped by MCP ToolLatch.`,
    };
  }

  const wrapped = createWrappedServerConfig({
    serverName: input.serverName,
    command,
    args,
    policyPath: input.policyPath ?? "toollatch.policy.yaml",
  });
  serverContainer[input.serverName] = {
    ...server,
    command: wrapped.command,
    args: wrapped.args,
  };

  return {
    client: input.client,
    serverName: input.serverName,
    configPath,
    changed: true,
    alreadyWrapped: false,
    originalConfig,
    updatedConfig: `${JSON.stringify(parsed, null, 2)}\n`,
    changes: [
      {
        path: `mcpServers.${input.serverName}.command`,
        before: redactObject(command),
        after: redactObject(wrapped.command),
      },
      {
        path: `mcpServers.${input.serverName}.args`,
        before: redactObject(args),
        after: redactObject(wrapped.args),
      },
    ],
    message: `Dry run prepared wrapped config for "${input.serverName}". Re-run with --write to apply.`,
  };
}

export async function applyWrappedConfig(input: ApplyConfigInput): Promise<ApplyConfigPlan> {
  const plan = await createApplyConfigPlan(input);
  if (input.write !== true || !plan.changed) {
    return plan;
  }

  const backupPath = createBackupPath(plan.configPath);
  await fs.copyFile(plan.configPath, backupPath);
  await fs.writeFile(plan.configPath, plan.updatedConfig, "utf8");
  return {
    ...plan,
    backupPath,
    message: `Updated ${plan.configPath}. Backup written to ${backupPath}.`,
  };
}

export async function restoreConfigBackup(input: RestoreConfigInput): Promise<RestoreConfigResult> {
  await fs.access(input.backupPath);
  const preRestoreBackupPath = createBackupPath(input.configPath, "pre-restore");
  await fs.copyFile(input.configPath, preRestoreBackupPath);
  await fs.copyFile(input.backupPath, input.configPath);
  return {
    configPath: input.configPath,
    backupPath: input.backupPath,
    preRestoreBackupPath,
  };
}

export async function resolveClientConfigPath(input: ApplyConfigInput): Promise<string> {
  if (input.configPath !== undefined) {
    return path.resolve(input.configPath);
  }

  const candidates = getClientConfigCandidates({
    clients: [input.client],
    homeDir: input.homeDir,
    appDataDir: input.appDataDir,
    platform: input.platform,
  });

  for (const candidate of candidates) {
    try {
      await fs.access(candidate.path);
      return candidate.path;
    } catch {
      // Continue through candidates; a missing config is reported after the loop.
    }
  }

  throw new AppError(
    "NOT_FOUND",
    `No ${input.client} MCP config file was found. Run toollatch doctor to see candidate paths.`,
  );
}

function parseJsonConfig(content: string, source: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const parsed = parse(content, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const formatted = errors
      .map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`)
      .join("; ");
    throw new AppError("CONFIG_INVALID", `Invalid JSON/JSONC in ${source}: ${formatted}`);
  }

  if (!isRecord(parsed)) {
    throw new AppError("CONFIG_INVALID", `Expected ${source} to contain a JSON object.`);
  }

  return parsed;
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function findServerContainer(root: Record<string, unknown>): Record<string, unknown> {
  const direct = root.mcpServers;
  if (isRecord(direct)) {
    return direct;
  }

  const mcp = root.mcp;
  if (isRecord(mcp) && isRecord(mcp.servers)) {
    return mcp.servers;
  }

  if (isRecord(root.servers)) {
    return root.servers;
  }

  throw new AppError("CONFIG_INVALID", "No MCP server container found in config.");
}

function isWrappedServer(server: Record<string, unknown>, serverName: string): boolean {
  if (server.command !== "toollatch" || !Array.isArray(server.args)) {
    return false;
  }
  const args = server.args.filter((item): item is string => typeof item === "string");
  const serverIndex = args.indexOf("--server");
  return args.includes("wrap") && serverIndex >= 0 && args[serverIndex + 1] === serverName;
}

function createBackupPath(configPath: string, label = "backup"): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${configPath}.${label}-${stamp}.bak`;
}
