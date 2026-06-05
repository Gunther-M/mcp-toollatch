# Trial Guide

This guide is for trying MCP ToolLatch `v0.3.0-beta.1` locally. Do not use it as a production-grade sandbox.

## Good Fit

- MCP users who want local visibility into configured servers.
- Cursor, Claude Desktop, or VS Code users experimenting with MCP tools.
- AI Agent toolchain developers testing safer tool-call workflows.
- Security researchers reviewing MCP policy, proxy, and audit behavior.

## Not A Good Fit

- Production systems that require a hard security boundary.
- Environments that need kernel-level sandboxing or container isolation.
- Teams that need RBAC, cloud policy management, or compliance workflows today.

## 10 Minute Trial

Install from source:

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js --version
```

Scan local MCP config candidates:

```bash
node packages/cli/dist/index.js scan --json
node packages/cli/dist/index.js scan --deep --json
```

Create and validate a strict policy:

```bash
node packages/cli/dist/index.js init --profile strict --force
node packages/cli/dist/index.js policy check
node packages/cli/dist/index.js doctor --json
```

Preview a wrapped fake MCP server:

```bash
node packages/cli/dist/index.js wrap --server fake --print-config -- node tests/fixtures/fake-mcp-server.js
```

Run a real proxy E2E with the fixture server:

```bash
node packages/cli/dist/index.js wrap --server fake -- node tests/fixtures/fake-mcp-server.js
```

Send JSON-RPC lines to stdin:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"trial","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"read_file","arguments":{"path":"docs/vision.md"}}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"read_file","arguments":{"path":".env"}}}
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"shell_run","arguments":{"command":"rm -rf /tmp/toollatch-danger"}}}
```

Expected behavior:

- `initialize` and `tools/list` are forwarded.
- `docs/vision.md` is a safe read example.
- `.env` and `rm -rf` are blocked or confirmation-gated by policy.

Check audit logs:

```bash
node packages/cli/dist/index.js logs --json
```

## Feedback

Bug reports and feature requests are most useful when they include:

- OS and version.
- Node.js version.
- MCP client: Cursor, Claude Desktop, VS Code, or other.
- MCP server type and whether it is a real server or fixture.
- Exact command run.
- Error output or concise logs.
- Whether `scan --json`, `doctor --json`, or `logs --json` reproduces the issue.

## How To Report Issues

Use the most appropriate path:

- Beta trial feedback: [`.github/ISSUE_TEMPLATE/beta_trial_feedback.md`](../.github/ISSUE_TEMPLATE/beta_trial_feedback.md)
- Sanitized security report template: [`.github/ISSUE_TEMPLATE/security_report.md`](../.github/ISSUE_TEMPLATE/security_report.md)
- Discussion or pinned issue draft: [`docs/community/beta-trial-discussion-template.md`](./community/beta-trial-discussion-template.md)
- Private security guidance: [`SECURITY.md`](../SECURITY.md)

For possible real credential exposure, policy bypass, arbitrary command execution, or private data leakage, do not open a detailed public issue. Follow `SECURITY.md` and share only a sanitized minimal reproduction publicly.

## Privacy Reminder

- Do not attach `.env` files.
- Do not paste tokens, passwords, API keys, private keys, certificates, cookies, or authorization headers.
- Redact audit logs before sharing.
- Prefer fixture configs over real client configs when possible.
