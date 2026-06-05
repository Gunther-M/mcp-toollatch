import { describe, expect, it } from "vitest";
import { createDefaultPolicy } from "@mcp-toollatch/policy";
import {
  createBlockedResponse,
  createWrappedServerConfig,
  interceptClientMessage,
  toolCallFromMessage,
} from "./index";

describe("proxy interception", () => {
  const policy = createDefaultPolicy();

  it("forwards non tools/call messages", async () => {
    const message = { jsonrpc: "2.0" as const, id: 1, method: "initialize", params: {} };
    const result = await interceptClientMessage(message, { serverName: "fixture", policy });
    expect(result.kind).toBe("forward");
  });

  it("extracts tools/call requests", () => {
    const request = toolCallFromMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "read_file", arguments: { path: ".env" } },
    }, "fs");
    expect(request?.toolName).toBe("read_file");
    expect(request?.arguments.path).toBe(".env");
  });

  it("blocks sensitive file reads before forwarding", async () => {
    const result = await interceptClientMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "read_file", arguments: { path: ".env" } },
    }, { serverName: "fs", policy, cwd: "C:/repo", isInteractive: false });
    expect(result.kind).toBe("respond");
    if (result.kind !== "respond") {
      throw new Error("Expected blocked response");
    }
    expect(result.decision.action).toBe("block");
  });

  it("allows safe source reads", async () => {
    const result = await interceptClientMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "read_file", arguments: { path: "./src/index.ts" } },
    }, { serverName: "fs", policy, cwd: "C:/repo", isInteractive: false });
    expect(result.kind).toBe("forward");
    expect(result.decision?.action).toBe("allow");
  });

  it("turns confirmed calls into allowed forwards", async () => {
    const result = await interceptClientMessage({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "mystery", arguments: {} },
    }, { serverName: "x", policy, isInteractive: true, confirm: () => true });
    expect(result.kind).toBe("forward");
    expect(result.decision?.action).toBe("allow");
  });

  it("creates MCP-compatible blocked responses", () => {
    const response = createBlockedResponse({ jsonrpc: "2.0", id: "a" }, {
      action: "block",
      risk: "critical",
      reason: "no",
    });
    expect(response.id).toBe("a");
    expect(response.error).toBeDefined();
  });

  it("creates wrapped server config snippets", () => {
    expect(createWrappedServerConfig({
      serverName: "fs",
      command: "node",
      args: ["server.js"],
      policyPath: "toollatch.policy.yaml",
    })).toEqual({
      command: "toollatch",
      args: ["wrap", "--server", "fs", "--policy", "toollatch.policy.yaml", "--", "node", "server.js"],
    });
  });
});
