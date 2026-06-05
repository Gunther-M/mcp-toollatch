# Claude Desktop Example

Run a scan:

```bash
toollatch scan --client claude-desktop
```

Original `claude_desktop_config.json` entry:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": ["./server.js"]
    }
  }
}
```

Wrapped entry:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "toollatch",
      "args": [
        "wrap",
        "--server",
        "filesystem",
        "--policy",
        "toollatch.policy.yaml",
        "--",
        "node",
        "./server.js"
      ]
    }
  }
}
```

MCP ToolLatch does not edit this file automatically in phase 1.
