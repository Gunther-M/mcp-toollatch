# MCP ToolLatch

Local policy, approval, and audit for MCP tool calls.

MCP ToolLatch is a local MCP security gateway for AI Agent tool calls. Phase 1 provides a CLI-first MVP for scanning MCP client configuration, generating a default local policy, wrapping stdio MCP servers, intercepting risky `tools/call` requests, and reading JSONL audit logs.

中文简介：MCP ToolLatch 是一个本地运行的 MCP 与 AI Agent 工具调用安全网关。一期重点是扫描、策略、stdio 代理、拦截和审计，不做 Web Dashboard。

## Status

Pre-alpha / active development / not production-ready.

MCP ToolLatch is useful for local experimentation and early safety visibility, but it is not a complete sandbox.

## Install And Verify

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm lint
```

Run the built CLI locally:

```bash
node packages/cli/dist/index.js --help
```

## Commands

### Scan

Scan common Cursor, Claude Desktop, and VS Code MCP configuration locations:

```bash
toollatch scan
toollatch scan --json
toollatch scan --client cursor --output report.json
```

The scanner reports client config status, server names, commands, args, redacted env summaries, capabilities, risk levels, and warnings.

### Init

Generate a default local policy:

```bash
toollatch init
toollatch init --force
toollatch policy check toollatch.policy.yaml
```

The default policy blocks sensitive paths such as `.env`, `.env.*`, `~/.ssh`, `~/.aws`, `~/.config`, `*.pem`, `*.key`, `*.crt`, `*.p12`, and `*.pfx`. It also blocks dangerous shell patterns such as `rm -rf`, `sudo`, `curl * | sh`, `wget * | sh`, `chmod 777`, and `dd if=`.

### Wrap

Wrap a stdio MCP server:

```bash
toollatch wrap --server filesystem -- node ./server.js
toollatch wrap --server filesystem --print-config -- node ./server.js
```

The proxy transparently forwards JSON-RPC messages and intercepts `tools/call` requests before they reach the real server. Blocking responses include risk, reason, matched rule, and suggested fix. Confirmation decisions are denied by default in non-interactive sessions.

### Logs

Read recent audit events:

```bash
toollatch logs
toollatch logs --limit 20
toollatch logs --decision block
toollatch logs --json
```

Audit logs are JSONL. Tool arguments are summarized and sensitive keys such as token, secret, password, api_key, authorization, and cookie are redacted.

## Packages

- `@mcp-toollatch/cli` - command entrypoints and user-facing output
- `@mcp-toollatch/core` - shared types, errors, risk levels, and redaction utilities
- `@mcp-toollatch/scanner` - MCP config discovery and static risk reporting
- `@mcp-toollatch/policy` - YAML policy loading, validation, extraction, and decisions
- `@mcp-toollatch/proxy` - stdio JSON-RPC forwarding and `tools/call` interception
- `@mcp-toollatch/audit` - JSONL audit write/read/query
- `@mcp-toollatch/rules` - built-in sensitive path, command, and classifier rules

## Security Notice

MCP ToolLatch phase 1 is not a full sandbox. It does not provide kernel-level isolation, complete prompt-injection defense, enterprise compliance, or guaranteed containment of malicious MCP servers. It is a local policy and visibility layer that can block common sensitive file access and dangerous command patterns.

安全声明：本项目第一阶段不是完整沙箱，不承诺防御所有 prompt injection 或数据泄露。

## Roadmap

See [ROADMAP.md](./ROADMAP.md), [docs/mvp-scope.md](./docs/mvp-scope.md), and [docs/threat-model.md](./docs/threat-model.md).

## License

Apache-2.0. See [LICENSE](./LICENSE).
