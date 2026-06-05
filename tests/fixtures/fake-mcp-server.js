#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
  terminal: false,
});

process.stderr.write("fake-mcp-server ready\n");

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return;
  }

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    send({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32700,
        message: "Parse error",
      },
    });
    return;
  }

  handleMessage(message);
});

function handleMessage(message) {
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "fake-mcp-server", version: "0.0.0" },
      },
    });
    return;
  }

  if (message.method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        tools: [
          {
            name: "read_file",
            description: "Read a file from the fixture working directory.",
            inputSchema: { type: "object", properties: { path: { type: "string" } } },
          },
          {
            name: "write_file",
            description: "Write a file in the fixture working directory.",
            inputSchema: {
              type: "object",
              properties: { path: { type: "string" }, content: { type: "string" } },
            },
          },
          {
            name: "shell_run",
            description: "Pretend to execute a shell command.",
            inputSchema: { type: "object", properties: { command: { type: "string" } } },
          },
        ],
      },
    });
    return;
  }

  if (message.method === "tools/call") {
    handleToolCall(message);
    return;
  }

  send({
    jsonrpc: "2.0",
    id: message.id,
    error: { code: -32601, message: "Method not found" },
  });
}

function handleToolCall(message) {
  const params = message.params ?? {};
  const args = params.arguments ?? {};

  if (params.name === "read_file") {
    const filePath = path.resolve(process.cwd(), String(args.path ?? ""));
    const content = fs.readFileSync(filePath, "utf8");
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: { content: [{ type: "text", text: content }] },
    });
    return;
  }

  if (params.name === "write_file") {
    const filePath = path.resolve(process.cwd(), String(args.path ?? ""));
    fs.writeFileSync(filePath, String(args.content ?? ""), "utf8");
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: { content: [{ type: "text", text: "written" }] },
    });
    return;
  }

  if (params.name === "shell_run") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: { content: [{ type: "text", text: `would run: ${String(args.command ?? "")}` }] },
    });
    return;
  }

  send({
    jsonrpc: "2.0",
    id: message.id,
    error: { code: -32602, message: "Unknown tool" },
  });
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
