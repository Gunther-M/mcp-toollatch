# Client Setup

Client-specific setup can be copy-paste oriented or safely automated. `toollatch apply` is dry-run by default. It writes only with `--write`, creates a backup first, and can restore from that backup.

Use `toollatch config paths` to list known Cursor, Claude Desktop, and VS Code MCP config candidates before changing anything.

## Cursor

Common config locations include `.cursor/mcp.json` and Cursor's user application support settings. Run:

```bash
toollatch scan --client cursor
toollatch scan --deep --client cursor --config ./mcp.json --json
toollatch wrap --server filesystem --print-config -- node ./server.js
toollatch apply --client cursor --server filesystem --config ./mcp.json --json
toollatch apply --client cursor --server filesystem --config ./mcp.json --write
```

Review the dry-run output before using `--write`. If needed, restore with `toollatch restore --config ./mcp.json --backup <backup-file>`.

## Claude Desktop

Common config files are named `claude_desktop_config.json`. Run:

```bash
toollatch scan --client claude-desktop
toollatch wrap --server filesystem --print-config -- node ./server.js
toollatch apply --client claude-desktop --server filesystem --config ./claude_desktop_config.json --json
```

Use the printed snippet as the replacement command for the MCP server you want to protect.

## VS Code

VS Code MCP configuration is usually stored in user `settings.json` or `.vscode/mcp.json`.

```bash
toollatch scan --client vscode
toollatch wrap --server filesystem --print-config -- node ./server.js
toollatch apply --client vscode --server filesystem --config ./settings.json --json
```

For all clients, automatic writes require `--write` and create a `.bak` file next to the original config.
