# Cursor Example

Run a scan:

```bash
toollatch scan --client cursor
```

Original server entry:

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

Wrapped server entry:

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

Generate a snippet:

```bash
toollatch wrap --server filesystem --print-config -- node ./server.js
```
