# VS Code Example

Run a scan:

```bash
toollatch scan --client vscode
```

Example settings shape:

```json
{
  "mcp": {
    "servers": {
      "filesystem": {
        "command": "node",
        "args": ["./server.js"]
      }
    }
  }
}
```

Wrapped entry:

```json
{
  "mcp": {
    "servers": {
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
}
```
