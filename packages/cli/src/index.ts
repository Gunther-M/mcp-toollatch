#!/usr/bin/env node
import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Command, InvalidArgumentError } from "commander";
import { exportAuditEvents, readAuditEvents, type AuditExportFormat, type AuditQuery } from "@mcp-toollatch/audit";
import { applyWrappedConfig, restoreConfigBackup } from "@mcp-toollatch/config";
import { AppError, exitCodes, projectMetadata, type PolicyDecisionAction } from "@mcp-toollatch/core";
import { runDoctor, summarizeDoctorReport } from "@mcp-toollatch/doctor";
import {
  defaultPolicyFileName,
  initPolicyFile,
  loadPolicyFile,
  type PolicyProfile,
  type ToolLatchPolicy,
} from "@mcp-toollatch/policy";
import { createWrappedServerConfig, runStdioProxy, type ConfirmToolCall } from "@mcp-toollatch/proxy";
import {
  getClientConfigCandidates,
  scanMcpConfigs,
  summarizeScanReport,
  type ClientId,
} from "@mcp-toollatch/scanner";
import {
  builtInRiskRules,
  defaultAllowedPathPatterns,
  defaultConfirmCommandPatterns,
  defaultDangerousCommandPatterns,
  defaultSensitivePathPatterns,
} from "@mcp-toollatch/rules";

export function createProgram(): Command {
  const program = new Command();

  program
    .name(projectMetadata.commandName)
    .description(projectMetadata.tagline)
    .version(projectMetadata.version)
    .showHelpAfterError()
    .exitOverride();

  program
    .command("scan")
    .description("Scan local MCP client configuration and report server risk.")
    .option("--json", "print structured JSON")
    .option("--output <file>", "write the scan report to a JSON file")
    .option("--client <client>", "limit scan to cursor, claude-desktop, or vscode", parseClient)
    .option("--config <file>", "explicit config path for the selected --client")
    .option("--deep", "start configured stdio servers and call initialize/tools/list")
    .option("--timeout <ms>", "deep scan timeout in milliseconds", parsePositiveInteger, 3000)
    .action(async (options: {
      json?: boolean;
      output?: string;
      client?: ClientId;
      config?: string;
      deep?: boolean;
      timeout: number;
    }) => {
      if (options.config !== undefined && options.client === undefined) {
        throw new AppError("CONFIG_INVALID", "--config requires --client so MCP ToolLatch knows how to parse the file.");
      }
      const report = await scanMcpConfigs({
        clients: options.client === undefined ? undefined : [options.client],
        configPaths:
          options.client === undefined || options.config === undefined
            ? undefined
            : { [options.client]: [path.resolve(options.config)] },
        deep: options.deep === true,
        deepTimeoutMs: options.timeout,
      });

      if (options.output !== undefined) {
        await writeJsonFile(options.output, report);
      }

      if (options.json === true) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(summarizeScanReport(report));
      }
    });

  program
    .command("init")
    .description("Generate a default local MCP ToolLatch policy file.")
    .option("-o, --output <file>", "policy file path", defaultPolicyFileName)
    .option("-f, --force", "overwrite an existing policy file")
    .option("--profile <profile>", "policy profile: observe, balanced, or strict", parsePolicyProfile, "balanced")
    .action(async (options: { output: string; force?: boolean; profile: PolicyProfile }) => {
      const result = await initPolicyFile({
        filePath: options.output,
        force: options.force === true,
        profile: options.profile,
      });
      console.log(`Created policy: ${result.filePath}`);
      console.log(`Profile: ${options.profile}`);
      console.log(`Rules: ${result.policy.rules.length}`);
      console.log("Next: toollatch scan && toollatch wrap --server <name> -- <real command> [args...]");
    });

  program
    .command("policy")
    .description("Inspect and validate MCP ToolLatch policy files.")
    .command("check")
    .description("Validate a policy YAML file.")
    .argument("[file]", "policy file path", defaultPolicyFileName)
    .action(async (file: string) => {
      const policy = await loadPolicyFile(path.resolve(file));
      console.log(`Policy OK: ${path.resolve(file)}`);
      console.log(`Rules: ${policy.rules.length}`);
    });

  program
    .command("doctor")
    .description("Diagnose local MCP ToolLatch setup and suggest safe next commands.")
    .option("--policy <file>", "policy file path", defaultPolicyFileName)
    .option("--audit-log <file>", "audit JSONL path")
    .option("--client <client>", "limit diagnostics to cursor, claude-desktop, or vscode", parseClient)
    .option("--deep", "include scan --deep probing in diagnostics")
    .option("--json", "print structured JSON")
    .action(
      async (options: {
        policy: string;
        auditLog?: string;
        client?: ClientId;
        deep?: boolean;
        json?: boolean;
      }) => {
        const report = await runDoctor({
          policyPath: options.policy,
          auditLogPath: options.auditLog,
          clients: options.client === undefined ? undefined : [options.client],
          deep: options.deep === true,
        });

        if (options.json === true) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(summarizeDoctorReport(report));
        }
      },
    );

  const configCommand = program
    .command("config")
    .description("Inspect MCP client config paths.");

  configCommand
    .command("paths")
    .description("Print known MCP client config path candidates.")
    .option("--client <client>", "limit output to cursor, claude-desktop, or vscode", parseClient)
    .option("--json", "print structured JSON")
    .action((options: { client?: ClientId; json?: boolean }) => {
      const candidates = getClientConfigCandidates({
        clients: options.client === undefined ? undefined : [options.client],
      });

      if (options.json === true) {
        console.log(JSON.stringify(candidates, null, 2));
        return;
      }

      for (const candidate of candidates) {
        console.log(`${candidate.displayName} (${candidate.client}): ${candidate.path}`);
      }
    });

  const rulesCommand = program
    .command("rules")
    .description("Inspect built-in MCP ToolLatch rule references.");

  rulesCommand
    .command("list")
    .description("List built-in risk and policy pattern rules.")
    .option("--json", "print structured JSON")
    .action((options: { json?: boolean }) => {
      const result = {
        riskRules: builtInRiskRules,
        sensitivePathPatterns: defaultSensitivePathPatterns,
        allowedPathPatterns: defaultAllowedPathPatterns,
        dangerousCommandPatterns: defaultDangerousCommandPatterns,
        confirmCommandPatterns: defaultConfirmCommandPatterns,
      };

      if (options.json === true) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log("Risk rules:");
      for (const rule of builtInRiskRules) {
        console.log(`- ${rule.id} ${rule.severity.toUpperCase()} ${rule.title}`);
      }
      console.log("\nSensitive path patterns:");
      for (const pattern of defaultSensitivePathPatterns) {
        console.log(`- ${pattern}`);
      }
      console.log("\nDangerous command patterns:");
      for (const pattern of defaultDangerousCommandPatterns) {
        console.log(`- ${pattern}`);
      }
    });

  program
    .command("wrap")
    .description("Run a stdio MCP proxy around a real MCP server.")
    .option("--server <name>", "logical MCP server name for audit logs")
    .option("--policy <file>", "policy file path", defaultPolicyFileName)
    .option("--audit-log <file>", "audit JSONL path; defaults to policy audit.path")
    .option("--print-config", "print a wrapped MCP server config snippet and exit")
    .option("--confirm-timeout <ms>", "interactive confirmation timeout in milliseconds", parsePositiveInteger, 30_000)
    .allowUnknownOption(true)
    .argument("<command...>", "real MCP server command after --")
    .action(
      async (
        commandParts: string[],
        options: {
          server?: string;
          policy: string;
          auditLog?: string;
          printConfig?: boolean;
          confirmTimeout: number;
        },
      ) => {
        const [command, ...args] = commandParts;
        if (command === undefined) {
          throw new AppError("PROXY_FAILED", "Missing real server command. Usage: toollatch wrap --server name -- node server.js");
        }

        const serverName = options.server?.trim();
        if (options.printConfig === true) {
          console.log(
            JSON.stringify(
              createWrappedServerConfig({
                serverName: serverName === undefined || serverName.length === 0 ? "mcp-server" : serverName,
                command,
                args,
                policyPath: options.policy,
              }),
              null,
              2,
            ),
          );
          return;
        }

        if (serverName === undefined || serverName.length === 0) {
          throw new AppError("PROXY_FAILED", "Missing --server name. Usage: toollatch wrap --server name -- node server.js");
        }

        const policy = await loadPolicyFile(path.resolve(options.policy));
        const auditLogPath = path.resolve(options.auditLog ?? policy.audit.path);
        const exitCode = await runStdioProxy({
          serverName,
          command,
          args,
          policy,
          auditLogPath,
          cwd: process.cwd(),
          isInteractive: process.stdin.isTTY,
          confirm: createConfirmPrompt(options.confirmTimeout),
        });
        process.exitCode = exitCode;
      },
    );

  program
    .command("apply")
    .description("Safely wrap a configured MCP server in a client config. Dry-run by default.")
    .requiredOption("--client <client>", "cursor, claude, claude-desktop, or vscode", parseClient)
    .requiredOption("--server <name>", "server name in the MCP client config")
    .option("--config <file>", "explicit client config path")
    .option("--policy <file>", "policy path to place in wrapped command", defaultPolicyFileName)
    .option("--dry-run", "prepare and print a safe change summary without writing files")
    .option("--write", "write the updated config after creating a backup")
    .option("--yes", "write alias for --write, intended for scripted validation")
    .option("--json", "print structured JSON")
    .action(
      async (options: {
        client: ClientId;
        server: string;
        config?: string;
        policy: string;
        dryRun?: boolean;
        write?: boolean;
        yes?: boolean;
        json?: boolean;
      }) => {
        if (options.dryRun === true && (options.write === true || options.yes === true)) {
          throw new AppError("CONFIG_INVALID", "--dry-run cannot be combined with --write or --yes.");
        }
        const result = await applyWrappedConfig({
          client: options.client,
          serverName: options.server,
          configPath: options.config,
          policyPath: options.policy,
          write: options.write === true || options.yes === true,
        });

        if (options.json === true) {
          console.log(JSON.stringify(formatApplyConfigResult(result), null, 2));
          return;
        }

        console.log(result.message);
        console.log(`Config: ${result.configPath}`);
        if (result.backupPath !== undefined) {
          console.log(`Backup: ${result.backupPath}`);
        }
        if (result.changes.length > 0) {
          console.log("Changes:");
          for (const change of result.changes) {
            console.log(`- ${change.path}: ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`);
          }
        }
        if (options.write !== true && options.yes !== true && result.changed) {
          console.log("No files were changed. Re-run with --write or --yes to apply after reviewing the JSON diff.");
        }
      },
    );

  program
    .command("restore")
    .description("Restore a client config from an MCP ToolLatch backup.")
    .requiredOption("--config <file>", "client config path to restore")
    .requiredOption("--backup <file>", "backup file to restore from")
    .option("--json", "print structured JSON")
    .action(async (options: { config: string; backup: string; json?: boolean }) => {
      const result = await restoreConfigBackup({
        configPath: path.resolve(options.config),
        backupPath: path.resolve(options.backup),
      });

      if (options.json === true) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`Restored ${result.configPath} from ${result.backupPath}`);
      console.log(`Previous current config was backed up to ${result.preRestoreBackupPath}`);
    });

  const logsCommand = program
    .command("logs")
    .description("Show recent MCP ToolLatch audit events.")
    .option("--policy <file>", "policy file path", defaultPolicyFileName)
    .option("--log-file <file>", "audit JSONL path; defaults to policy audit.path")
    .option("--limit <number>", "maximum events to show", parsePositiveInteger, 50)
    .option("--server <name>", "filter by server")
    .option("--tool <name>", "filter by tool")
    .option("--decision <decision>", "filter by allow, block, or confirm", parseDecision)
    .option("--since <iso-date>", "filter events after an ISO timestamp")
    .option("--json", "print structured JSON")
    .action(
      async (options: {
        policy: string;
        logFile?: string;
        limit: number;
        server?: string;
        tool?: string;
        decision?: PolicyDecisionAction;
        since?: string;
        json?: boolean;
      }) => {
        const policy = await loadPolicyOrDefault(options.policy);
        const logFile = path.resolve(options.logFile ?? policy.audit.path);
        const query: AuditQuery = {
          limit: options.limit,
          server: options.server,
          tool: options.tool,
          decision: options.decision,
          since: options.since === undefined ? undefined : new Date(options.since),
        };
        const events = await readAuditEvents(logFile, query);

        if (options.json === true) {
          console.log(JSON.stringify(events, null, 2));
        } else {
          console.log(formatAuditEvents(events, logFile));
        }
      },
    );

  logsCommand
    .command("export")
    .description("Export audit events as redacted JSON or CSV.")
    .option("--policy <file>", "policy file path", defaultPolicyFileName)
    .option("--log-file <file>", "audit JSONL path; defaults to policy audit.path")
    .option("--format <format>", "json or csv", parseAuditExportFormat, "json")
    .requiredOption("--out <file>", "output file path")
    .option("--limit <number>", "maximum events to export", parsePositiveInteger, 50)
    .option("--server <name>", "filter by server")
    .option("--tool <name>", "filter by tool")
    .option("--decision <decision>", "filter by allow, block, or confirm", parseDecision)
    .option("--since <iso-date>", "filter events after an ISO timestamp")
    .option("--json", "print export result as JSON")
    .action(
      async (options: {
        policy?: string;
        logFile?: string;
        format: AuditExportFormat;
        out: string;
        limit: number;
        server?: string;
        tool?: string;
        decision?: PolicyDecisionAction;
        since?: string;
        json?: boolean;
      }) => {
        const parentOptions = logsCommand.opts<{
          policy?: string;
          logFile?: string;
          limit?: number;
          server?: string;
          tool?: string;
          decision?: PolicyDecisionAction;
          since?: string;
          json?: boolean;
        }>();
        const policy = await loadPolicyOrDefault(options.policy ?? parentOptions.policy ?? defaultPolicyFileName);
        const logFile = path.resolve(options.logFile ?? parentOptions.logFile ?? policy.audit.path);
        const query: AuditQuery = {
          limit: options.limit ?? parentOptions.limit,
          server: options.server ?? parentOptions.server,
          tool: options.tool ?? parentOptions.tool,
          decision: options.decision ?? parentOptions.decision,
          since: options.since === undefined && parentOptions.since === undefined
            ? undefined
            : new Date(options.since ?? String(parentOptions.since)),
        };
        const result = await exportAuditEvents({
          logFilePath: logFile,
          outFilePath: path.resolve(options.out),
          format: options.format,
          query,
        });

        if (options.json === true || parentOptions.json === true) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Exported ${result.count} audit events to ${result.outFilePath}`);
        }
      },
    );

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  try {
    await createProgram().parseAsync(argv);
  } catch (error) {
    handleCliError(error);
  }
}

function handleCliError(error: unknown): void {
  if (error instanceof Command) {
    return;
  }

  if (isCommanderExit(error)) {
    process.exitCode = error.exitCode;
    if (error.code !== "commander.helpDisplayed" && error.message.length > 0) {
      console.error(error.message);
    }
    return;
  }

  if (error instanceof AppError) {
    process.exitCode = exitCodes[error.code];
    console.error(error.message);
    return;
  }

  process.exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
}

function parseClient(value: string): ClientId {
  if (value === "claude") {
    return "claude-desktop";
  }
  if (value === "cursor" || value === "claude-desktop" || value === "vscode") {
    return value;
  }
  throw new InvalidArgumentError("Expected one of: cursor, claude, claude-desktop, vscode");
}

function parsePolicyProfile(value: string): PolicyProfile {
  if (value === "observe" || value === "balanced" || value === "strict") {
    return value;
  }
  throw new InvalidArgumentError("Expected one of: observe, balanced, strict");
}

function parseDecision(value: string): PolicyDecisionAction {
  if (value === "allow" || value === "block" || value === "confirm") {
    return value;
  }
  throw new InvalidArgumentError("Expected one of: allow, block, confirm");
}

function parseAuditExportFormat(value: string): AuditExportFormat {
  if (value === "json" || value === "csv") {
    return value;
  }
  throw new InvalidArgumentError("Expected one of: json, csv");
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Expected a positive integer");
  }
  return parsed;
}

function createConfirmPrompt(timeoutMs: number): ConfirmToolCall | undefined {
  if (!process.stdin.isTTY) {
    return undefined;
  }

  const allowedForSession = new Set<string>();

  return async (request, decision) => {
    const sessionKey = `${request.serverName}:${request.toolName}`;
    if (allowedForSession.has(sessionKey)) {
      return true;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    try {
      process.stderr.write("\nMCP ToolLatch requires confirmation.\n");
      process.stderr.write(`Server: ${request.serverName}\nTool: ${request.toolName}\n`);
      process.stderr.write(`Reason: ${decision.reason}\n`);
      if (decision.suggestedFix !== undefined) {
        process.stderr.write(`Suggested fix: ${decision.suggestedFix}\n`);
      }
      const answer = await questionWithTimeout(
        rl,
        `Choose: [o]nce, [s]ession, [b]lock (default block after ${timeoutMs}ms): `,
        timeoutMs,
      );
      const normalized = answer.trim().toLowerCase();
      if (normalized === "s" || normalized === "session") {
        allowedForSession.add(sessionKey);
        return true;
      }
      return normalized === "o" || normalized === "once" || normalized === "y" || normalized === "yes";
    } finally {
      rl.close();
    }
  };
}

async function questionWithTimeout(
  rl: readline.Interface,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      rl.question(prompt),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve(""), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

async function loadPolicyOrDefault(filePath: string): Promise<ToolLatchPolicy> {
  try {
    return await loadPolicyFile(path.resolve(filePath));
  } catch (error) {
    if (error instanceof AppError && error.code === "CONFIG_INVALID") {
      throw error;
    }
    return {
      version: 1,
      mode: "enforce",
      defaults: {
        unknown_tool: "confirm",
        log_all_calls: true,
        non_interactive_confirm: "deny",
      },
      audit: {
        enabled: true,
        path: ".toollatch/audit.jsonl",
      },
      rules: [],
    };
  }
}

function formatAuditEvents(events: Awaited<ReturnType<typeof readAuditEvents>>, logFile: string): string {
  if (events.length === 0) {
    return `No audit events found in ${logFile}`;
  }

  return events
    .map((event) => {
      const rule = event.matchedRuleId === undefined ? "" : ` rule=${event.matchedRuleId}`;
      return `${event.timestamp} ${event.decision.toUpperCase()} ${event.risk.toUpperCase()} ${event.server}/${event.tool}${rule}\n  ${event.reason}\n  args: ${event.argumentsSummary}`;
    })
    .join("\n");
}

function formatApplyConfigResult(result: Awaited<ReturnType<typeof applyWrappedConfig>>): {
  client: ClientId;
  serverName: string;
  configPath: string;
  changed: boolean;
  alreadyWrapped: boolean;
  backupPath?: string;
  changes: Array<{ path: string; before: unknown; after: unknown }>;
  message: string;
} {
  return {
    client: result.client,
    serverName: result.serverName,
    configPath: result.configPath,
    changed: result.changed,
    alreadyWrapped: result.alreadyWrapped,
    backupPath: result.backupPath,
    changes: result.changes,
    message: result.message,
  };
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  const resolved = path.resolve(filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isCommanderExit(error: unknown): error is { code: string; exitCode: number; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "exitCode" in error &&
    "message" in error
  );
}

function isDirectCliRun(): boolean {
  if (process.argv[1] === undefined) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}

const isDirectRun = isDirectCliRun();

if (isDirectRun) {
  void run();
}
