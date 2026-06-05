# Phase 2 Local Demo

This demo uses only repository fixtures and files under `tmp/phase2-demo/`. It does not touch real Cursor, Claude Desktop, VS Code, `.env`, SSH, or certificate files.

## Prepare

```bash
pnpm install
pnpm build
```

Create demo files:

```bash
node -e "const fs=require('fs');fs.rmSync('tmp/phase2-demo',{recursive:true,force:true});fs.mkdirSync('tmp/phase2-demo/src',{recursive:true});fs.writeFileSync('tmp/phase2-demo/src/ok.txt','safe demo file\n');fs.writeFileSync('tmp/phase2-demo/.env','DEMO_TOKEN=do-not-copy\n');fs.writeFileSync('tmp/phase2-demo/secret.pem','demo private material\n');"
```

## Scan And Policy

```bash
node packages/cli/dist/index.js scan --json
node packages/cli/dist/index.js init --profile strict --force --output tmp/phase2-demo/toollatch.policy.yaml
node packages/cli/dist/index.js policy check tmp/phase2-demo/toollatch.policy.yaml
node packages/cli/dist/index.js doctor --json --policy tmp/phase2-demo/toollatch.policy.yaml
```

## Wrap Config Preview

```bash
node packages/cli/dist/index.js wrap --server fake --policy tmp/phase2-demo/toollatch.policy.yaml --audit-log tmp/phase2-demo/audit/audit.jsonl --print-config -- node tests/fixtures/fake-mcp-server.js
```

## Proxy Behavior

Start the wrapped fake server from the repository root:

```bash
node packages/cli/dist/index.js wrap --server fake --policy tmp/phase2-demo/toollatch.policy.yaml --audit-log tmp/phase2-demo/audit/audit.jsonl -- node tests/fixtures/fake-mcp-server.js
```

Send line-delimited JSON-RPC messages to stdin:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"demo","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"read_file","arguments":{"path":"./src/ok.txt"}}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"read_file","arguments":{"path":".env"}}}
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"read_file","arguments":{"path":"secret.pem"}}}
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"shell_run","arguments":{"command":"rm -rf /tmp/toollatch-danger"}}}
```

Expected results:

- `initialize` and `tools/list` are forwarded to the fake MCP server.
- `read_file ./src/ok.txt` is the safe allow-path example.
- `.env`, `secret.pem`, and `rm -rf` are blocked or confirmation-gated according to the selected profile.
- stdout contains JSON-RPC only; operational logs stay on stderr.

## Logs

```bash
node packages/cli/dist/index.js logs --log-file tmp/phase2-demo/audit/audit.jsonl --json
node packages/cli/dist/index.js logs export --log-file tmp/phase2-demo/audit/audit.jsonl --format json --out tmp/phase2-demo/audit/export.json --json
```

The exported audit data is redacted. It should not contain raw token, password, authorization, private key, certificate, or demo `.env` contents.
