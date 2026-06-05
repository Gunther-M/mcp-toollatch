#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { Command, InvalidArgumentError } from "commander";
import { readAuditEvents, type AuditQuery } from "@mcp-toollatch/audit";
import { AppError, exitCodes, projectMetadata, type PolicyDecisionAction } from "@mcp-toollatch/core";
import {
  defaultPolicyFileName,
  initPolicyFile,
  loadPolicyFile,
  type ToolLatchPolicy,
} from "@mcp-toollatch/policy";
import { createWrappedServerConfig, runStdioProxy, type ConfirmToolCall } from "@mcp-toollatch/proxy";
import { scanMcpConfigs, summarizeScanReport, type ClientId } from "@mcp-toollatch/scanner";

export function createProgram(): Command {
  const program = new Command();

  program
    .name(projectMetadata.commandName)
    .description(projectMetadata.tagline)
    .version("0.2.0")
    .showHelpAfterError()
    .exitOverride();

  program
    .command("scan")
    .description("Scan local MCP client configuration and report server risk.")
    .option("--json", "print structured JSON")
    .option("--output <file>", "write the scan report to a JSON file")
    .option("--client <client>", "limit scan to cursor, claude-desktop, or vscode", parseClient)
    .action(async (options: { json?: boolean; output?: string; client?: ClientId }) => {
      const report = await scanMcpConfigs({ clients: options.client === undefined ? undefined : [options.client] });

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
    .action(async (options: { output: string; force?: boolean }) => {
      const result = await initPolicyFile({ filePath: options.output, force: options.force === true });
      console.log(`Created policy: ${result.filePath}`);
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
    .command("wrap")
    .description("Run a stdio MCP proxy around a real MCP server.")
    .requiredOption("--server <name>", "logical MCP server name for audit logs")
    .option("--policy <file>", "policy file path", defaultPolicyFileName)
    .option("--audit-log <file>", "audit JSONL path; defaults to policy audit.path")
    .option("--print-config", "print a wrapped MCP server config snippet and exit")
    .allowUnknownOption(true)
    .argument("<command...>", "real MCP server command after --")
    .action(
      async (
        commandParts: string[],
        options: { server: string; policy: string; auditLog?: string; printConfig?: boolean },
      ) => {
        const [command, ...args] = commandParts;
        if (command === undefined) {
          throw new AppError("PROXY_FAILED", "Missing real server command. Usage: toollatch wrap --server name -- node server.js");
        }

        if (options.printConfig === true) {
          console.log(
            JSON.stringify(
              createWrappedServerConfig({
                serverName: options.server,
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

        const policy = await loadPolicyFile(path.resolve(options.policy));
        const auditLogPath = path.resolve(options.auditLog ?? policy.audit.path);
        const exitCode = await runStdioProxy({
          serverName: options.server,
          command,
          args,
          policy,
          auditLogPath,
          cwd: process.cwd(),
          isInteractive: process.stdin.isTTY,
          confirm: createConfirmPrompt(),
        });
        process.exitCode = exitCode;
      },
    );

  program
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
  if (value === "cursor" || value === "claude-desktop" || value === "vscode") {
    return value;
  }
  throw new InvalidArgumentError("Expected one of: cursor, claude-desktop, vscode");
}

function parseDecision(value: string): PolicyDecisionAction {
  if (value === "allow" || value === "block" || value === "confirm") {
    return value;
  }
  throw new InvalidArgumentError("Expected one of: allow, block, confirm");
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Expected a positive integer");
  }
  return parsed;
}

function createConfirmPrompt(): ConfirmToolCall | undefined {
  if (!process.stdin.isTTY) {
    return undefined;
  }

  return async (request, decision) => {
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
      const answer = await rl.question("Allow this call once? [y/N] ");
      return /^y(?:es)?$/i.test(answer.trim());
    } finally {
      rl.close();
    }
  };
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

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  void run();
}
