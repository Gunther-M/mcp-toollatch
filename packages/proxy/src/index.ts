import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import {
  AppError,
  ensureRecord,
  isRecord,
  type PolicyDecision,
  type ToolCallRequest,
} from "@mcp-toollatch/core";
import { recordAuditEvent } from "@mcp-toollatch/audit";
import { evaluateToolCall, type ToolLatchPolicy } from "@mcp-toollatch/policy";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: unknown;
  [key: string]: unknown;
}

export interface ProxyOptions {
  serverName: string;
  command: string;
  args: string[];
  policy: ToolLatchPolicy;
  auditLogPath: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  confirm?: ConfirmToolCall;
  isInteractive?: boolean;
}

export interface WrappedServerConfigInput {
  serverName: string;
  command: string;
  args: string[];
  policyPath?: string;
}

export type ConfirmToolCall = (
  request: ToolCallRequest,
  decision: PolicyDecision,
) => Promise<boolean> | boolean;

export type InterceptResult =
  | { kind: "forward"; message: JsonRpcRequest; decision?: PolicyDecision }
  | { kind: "respond"; message: JsonRpcRequest; decision: PolicyDecision };

export async function interceptClientMessage(
  message: JsonRpcRequest,
  options: Pick<ProxyOptions, "serverName" | "policy" | "cwd" | "confirm" | "isInteractive">,
): Promise<InterceptResult> {
  if (message.method !== "tools/call") {
    return { kind: "forward", message };
  }

  const request = toolCallFromMessage(message, options.serverName);
  if (request === undefined) {
    return { kind: "forward", message };
  }

  const initialDecision = evaluateToolCall(options.policy, request, {
    cwd: options.cwd,
    isInteractive: options.isInteractive ?? false,
  });

  if (initialDecision.action === "allow") {
    return { kind: "forward", message, decision: initialDecision };
  }

  if (initialDecision.action === "confirm") {
    const accepted = await options.confirm?.(request, initialDecision);
    if (accepted === true) {
      return {
        kind: "forward",
        message,
        decision: {
          ...initialDecision,
          action: "allow",
          reason: `${initialDecision.reason} User confirmed this call.`,
        },
      };
    }

    return {
      kind: "respond",
      message: createBlockedResponse(message, {
        ...initialDecision,
        action: "block",
        reason: `${initialDecision.reason} Confirmation was denied or unavailable.`,
      }),
      decision: {
        ...initialDecision,
        action: "block",
        reason: `${initialDecision.reason} Confirmation was denied or unavailable.`,
      },
    };
  }

  return {
    kind: "respond",
    message: createBlockedResponse(message, initialDecision),
    decision: initialDecision,
  };
}

export async function runStdioProxy(options: ProxyOptions): Promise<number> {
  if (options.command.trim().length === 0) {
    throw new AppError("PROXY_FAILED", "Missing real MCP server command after --.");
  }

  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  bridgeServerOutput(child);
  bridgeServerErrors(child);
  await bridgeClientInput(child, options);

  return await waitForExit(child);
}

export function createWrappedServerConfig(input: WrappedServerConfigInput): {
  command: string;
  args: string[];
} {
  return {
    command: "toollatch",
    args: [
      "wrap",
      "--server",
      input.serverName,
      ...(input.policyPath === undefined ? [] : ["--policy", input.policyPath]),
      "--",
      input.command,
      ...input.args,
    ],
  };
}

export function serializeJsonRpcMessage(message: JsonRpcRequest): string {
  return `${JSON.stringify(message)}\n`;
}

export function createBlockedResponse(request: JsonRpcRequest, decision: PolicyDecision): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: request.id,
    error: {
      code: -32001,
      message: "Blocked by MCP ToolLatch policy",
      data: {
        action: decision.action,
        risk: decision.risk,
        reason: decision.reason,
        matchedRuleId: decision.matchedRuleId,
        matchedRuleTitle: decision.matchedRuleTitle,
        suggestedFix: decision.suggestedFix,
      },
    },
  };
}

export function toolCallFromMessage(
  message: JsonRpcRequest,
  serverName: string,
): ToolCallRequest | undefined {
  if (message.method !== "tools/call" || !isRecord(message.params)) {
    return undefined;
  }

  const toolName = typeof message.params.name === "string" ? message.params.name : undefined;
  if (toolName === undefined) {
    return undefined;
  }

  return {
    serverName,
    toolName,
    arguments: ensureRecord(message.params.arguments),
    requestId: message.id,
  };
}

async function bridgeClientInput(
  child: ChildProcessWithoutNullStreams,
  options: ProxyOptions,
): Promise<void> {
  const lineReader = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
    terminal: false,
  });

  lineReader.on("line", (line) => {
    void handleClientLine(line, child, options);
  });

  await new Promise<void>((resolve) => {
    lineReader.once("close", () => {
      child.stdin.end();
      resolve();
    });
  });
}

async function handleClientLine(
  line: string,
  child: ChildProcessWithoutNullStreams,
  options: ProxyOptions,
): Promise<void> {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return;
  }

  let message: JsonRpcRequest;
  try {
    message = JSON.parse(trimmed) as JsonRpcRequest;
  } catch {
    child.stdin.write(`${line}\n`);
    return;
  }

  const startedAt = Date.now();
  const result = await interceptClientMessage(message, options);
  const request = toolCallFromMessage(message, options.serverName);

  if (request !== undefined && result.decision !== undefined && options.policy.audit.enabled) {
    await recordAuditEvent(options.auditLogPath, {
      request,
      decision: result.decision,
      startedAt,
    });
  }

  if (result.kind === "respond") {
    process.stdout.write(serializeJsonRpcMessage(result.message));
    return;
  }

  child.stdin.write(serializeJsonRpcMessage(result.message));
}

function bridgeServerOutput(child: ChildProcessWithoutNullStreams): void {
  child.stdout.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
  });
}

function bridgeServerErrors(child: ChildProcessWithoutNullStreams): void {
  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
  });
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once("error", (error) => {
      reject(new AppError("PROXY_FAILED", `Failed to start MCP server: ${error.message}`));
    });
    child.once("exit", (code) => {
      resolve(code ?? 0);
    });
  });
}
