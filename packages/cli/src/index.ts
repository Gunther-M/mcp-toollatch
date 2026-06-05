#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { Command } from "commander";

export const placeholderMessages = {
  scan: "MCP ToolLatch scan is not implemented yet. This command will detect MCP clients and server risk profiles.",
  init: "MCP ToolLatch policy init is not implemented yet. This command will generate a local policy file.",
  wrap: "MCP ToolLatch wrap is not implemented yet. This command will run a stdio MCP proxy.",
  logs: "MCP ToolLatch logs is not implemented yet. This command will inspect audit logs.",
} as const;

export function createProgram(): Command {
  const program = new Command();

  program
    .name("toollatch")
    .description("Local policy, approval, and audit for MCP tool calls.")
    .version("0.0.0");

  program
    .command("scan")
    .description("Detect MCP clients and server risk profiles.")
    .action(() => {
      console.log(placeholderMessages.scan);
    });

  program
    .command("init")
    .description("Generate a local policy file.")
    .action(() => {
      console.log(placeholderMessages.init);
    });

  program
    .command("wrap")
    .description("Run a stdio MCP proxy.")
    .action(() => {
      console.log(placeholderMessages.wrap);
    });

  program
    .command("logs")
    .description("Inspect audit logs.")
    .action(() => {
      console.log(placeholderMessages.logs);
    });

  return program;
}

export function run(argv: string[] = process.argv): void {
  createProgram().parse(argv);
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  run();
}
