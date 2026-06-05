# MCP ToolLatch

Local policy, approval, and audit for MCP tool calls.

MCP ToolLatch is a local safety gateway for MCP and AI Agent tool calls. It is designed to scan MCP client configuration, prepare local policy files, wrap stdio MCP servers, block or require approval for risky tool calls, and write audit logs.

中文简介：MCP ToolLatch 是一个本地运行的 MCP 与 AI Agent 工具调用安全网关，用于配置扫描、本地策略、调用确认和审计记录。

## Status

Pre-alpha / active development / not production-ready.

The first phase is a runnable project scaffold and CLI placeholder. It does not yet enforce real policy or proxy MCP traffic.

## Why This Exists

MCP servers can give AI agents access to external tools such as files, shell commands, databases, networks, and local applications. That power needs local visibility, policy, approval, and audit trails so users can understand and control what tool calls are happening.

MCP server 让 AI Agent 能访问文件、命令、数据库、网络等外部工具，因此需要本地策略、确认和审计。

## Phase 1 Goals

- scan MCP configs
- init local policy
- wrap stdio MCP servers
- block risky tool calls
- write audit logs

## Planned CLI

```bash
toollatch scan
toollatch init
toollatch wrap
toollatch logs
```

Current commands are placeholders only:

```bash
toollatch --help
toollatch scan
toollatch init
toollatch wrap
toollatch logs
```

## Packages

- `@mcp-toollatch/cli` - command-line interface
- `@mcp-toollatch/core` - shared types and metadata
- `@mcp-toollatch/scanner` - MCP client and server config scanner
- `@mcp-toollatch/policy` - policy schema and future evaluation logic
- `@mcp-toollatch/proxy` - future stdio MCP proxy
- `@mcp-toollatch/audit` - audit log models and future writers
- `@mcp-toollatch/rules` - risk rule metadata and future rule packs

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

## Security Notice

MCP ToolLatch is not a complete sandbox in the first phase. It does not promise to defend against every prompt injection, data leak, malicious MCP server, or unsafe local environment. Treat it as an early local visibility and control layer.

安全声明：本项目第一阶段不是完整沙箱，不承诺防御所有 prompt injection 或数据泄露。

## Roadmap

See [ROADMAP.md](./ROADMAP.md) and [docs/mvp-scope.md](./docs/mvp-scope.md).

## License

Apache-2.0. See [LICENSE](./LICENSE).
