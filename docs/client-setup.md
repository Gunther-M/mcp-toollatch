# Client Setup

Client-specific setup is intentionally copy-paste oriented. MCP ToolLatch prints wrapped server snippets but does not automatically rewrite client config in phase 1.

## Cursor

Common config locations include `.cursor/mcp.json` and Cursor's user application support settings. Run:

```bash
toollatch scan --client cursor
toollatch wrap --server filesystem --print-config -- node ./server.js
```

Copy the printed `command` and `args` into the relevant Cursor MCP server entry.

## Claude Desktop

Common config files are named `claude_desktop_config.json`. Run:

```bash
toollatch scan --client claude-desktop
toollatch wrap --server filesystem --print-config -- node ./server.js
```

Use the printed snippet as the replacement command for the MCP server you want to protect.

## VS Code

VS Code MCP configuration is usually stored in user `settings.json` or `.vscode/mcp.json`.

```bash
toollatch scan --client vscode
toollatch wrap --server filesystem --print-config -- node ./server.js
```

Phase 1 only prints suggested config. It does not edit VS Code settings automatically.
