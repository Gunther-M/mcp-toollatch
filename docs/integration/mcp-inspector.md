# MCP Inspector Validation

This guide validates MCP ToolLatch through the official MCP Inspector against the local fake MCP server fixture. It is intended for release checks and local troubleshooting.

## Prerequisites

- Node.js compatible with the current Inspector package. Inspector `0.22.0` requires Node `>=22.7.5`.
- Built ToolLatch CLI:

```bash
pnpm install
pnpm build
```

Check the runtime used by `npx`:

```bash
node -v
npx --version
```

If the machine Node is too old, use a temporary Node install outside global PATH changes. In this repository, validation may use a downloaded official Node zip under ignored `.tools/node-v22/`.

## Start Inspector

Run from the repository root:

```bash
npx @modelcontextprotocol/inspector -- node packages/cli/dist/index.js wrap --server fake -- node tests/fixtures/fake-mcp-server.js
```

The Inspector starts a local web UI and launches ToolLatch as the MCP command. Keep the terminal open while testing.

## Validation Checklist

1. Connect to the ToolLatch-wrapped server in Inspector.
2. Confirm the tool list includes `read_file`, `write_file`, `shell_run`, and `fetch_url`.
3. Call `read_file` with a safe path such as `./src/ok.txt` from a temporary fixture directory. The call should succeed when the policy allows it.
4. Call `read_file` with `.env`, `~/.ssh/id_rsa`, or `secret.pem`. ToolLatch should return a JSON-RPC error or confirmation/block outcome according to the active profile.
5. Call `shell_run` with a dangerous command such as `rm -rf /tmp/toollatch-danger`. ToolLatch should block it.
6. Call `fetch_url` with `http://169.254.169.254/latest/meta-data`. ToolLatch should block it through `RULE-NET-001`.
7. Inspect audit logs with:

```bash
node packages/cli/dist/index.js logs --json
```

The audit output must not include raw tokens, passwords, authorization headers, private keys, or file contents.

## Non-Interactive CLI Check

Inspector also provides `--cli` mode, which is useful for repeatable release validation. When testing a wrapped command that itself normally uses `--`, prefer an Inspector config file so argument separators do not conflict:

```json
{
  "mcpServers": {
    "fake": {
      "command": "node",
      "args": [
        "packages/cli/dist/index.js",
        "wrap",
        "--server",
        "fake",
        "--policy",
        "tmp/inspector/toollatch.policy.yaml",
        "--audit-log",
        "tmp/inspector/audit.jsonl",
        "node",
        "tests/fixtures/fake-mcp-server.js"
      ]
    }
  }
}
```

Then run:

```bash
npx @modelcontextprotocol/inspector --cli --config tmp/inspector/mcp.json --server fake -- --method tools/list
npx @modelcontextprotocol/inspector --cli --config tmp/inspector/mcp.json --server fake -- --method tools/call --tool-name read_file --tool-arg path=docs/vision.md
npx @modelcontextprotocol/inspector --cli --config tmp/inspector/mcp.json --server fake -- --method tools/call --tool-name read_file --tool-arg path=.env
npx @modelcontextprotocol/inspector --cli --config tmp/inspector/mcp.json --server fake -- --method tools/call --tool-name fetch_url --tool-arg url=http://169.254.169.254/latest/meta-data
```

The first two commands should succeed. The `.env` and metadata IP calls should be blocked or confirmation-gated according to the active policy profile.

## Troubleshooting

- `EBADENGINE` or Inspector refuses to start: upgrade the Node runtime used by `npx`, or use a temporary official Node zip under `.tools/`.
- Port already in use: stop the earlier Inspector process and rerun the command.
- Inspector connects but tools are missing: run `node packages/cli/dist/index.js wrap --print-config -- node tests/fixtures/fake-mcp-server.js` and confirm the wrapped command is correct.
- Protocol output is broken: verify logs are on stderr and stdout contains only JSON-RPC messages.
- Paths with spaces on Windows: keep the command and arguments as separate tokens, as shown above.
