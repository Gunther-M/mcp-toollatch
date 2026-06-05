# MCP ToolLatch

MCP ToolLatch is a local policy, approval, and audit gateway for MCP tool calls.

It scans MCP client configuration, generates local policies, wraps stdio MCP servers, intercepts risky `tools/call` requests, asks for confirmation when needed, and writes redacted JSONL audit logs.

## Status

Current release: `v0.3.0-beta.1`.

Beta-oriented local tool / active development / not a production-grade sandbox.

MCP ToolLatch is not a complete sandbox. It does not provide kernel-level protection, complete prompt-injection defense, enterprise compliance, or guaranteed containment of malicious MCP servers. It is suitable for small-scope trials and developer-local validation.

## Install

### From Source

```bash
git clone <repo-url>
cd mcp-toollatch
pnpm install
pnpm build
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js --version
```

During local development, commands in this README are shown as `toollatch ...`. From source, use `node packages/cli/dist/index.js ...` unless you have linked or installed the CLI.

### Local Tarball

The package has not been formally published to npm yet. For a local package trial:

```bash
pnpm --dir packages/cli pack --pack-destination ./tmp/packs
mkdir -p ./tmp/install-smoke
cd ./tmp/install-smoke
npm init -y
npm install ../packs/mcp-toollatch-cli-0.3.0-beta.1.tgz
npx toollatch --help
npx toollatch --version
```

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

## Quick Start

```bash
toollatch scan --json
toollatch scan --deep --json
toollatch init --profile strict --force
toollatch policy check
toollatch doctor --json
toollatch wrap --server filesystem -- node ./server.js
toollatch logs --json
```

For a fixture-only walkthrough, see [docs/demo/phase-2-demo.md](./docs/demo/phase-2-demo.md). For official MCP Inspector checks, see [docs/integration/mcp-inspector.md](./docs/integration/mcp-inspector.md).

## Commands

### Scan

Scan common Cursor, Claude Desktop, and VS Code MCP configuration locations:

```bash
toollatch scan
toollatch scan --json
toollatch scan --client cursor --output report.json
```

Deep scan starts configured stdio MCP servers and calls only `initialize` and `tools/list`:

```bash
toollatch scan --deep --client cursor --config ./mcp.json --timeout 5000 --json
```

Deep scan has a timeout and fails per server without breaking the whole scan. It does not call `tools/call`.

### Init

Generate a default local policy:

```bash
toollatch init --profile observe
toollatch init --profile balanced --force
toollatch init --profile strict --force
toollatch policy check toollatch.policy.yaml
```

Profiles:

- `observe`: allow calls while logging what would have matched.
- `balanced`: block sensitive paths and dangerous commands, confirm high-impact/unknown calls.
- `strict`: block sensitive paths, dangerous commands, and stricter unknown/high-impact calls.

### Doctor

Diagnose the local setup and get repair suggestions:

```bash
toollatch doctor
toollatch doctor --json
toollatch doctor --deep --client cursor
```

Doctor reports discovered clients, discovered servers, high-risk configuration, policy status, audit log status, and suggested next commands.

### Config And Rules

Inspect known client config path candidates and built-in rule references:

```bash
toollatch config paths
toollatch config paths --client cursor --json
toollatch rules list
toollatch rules list --json
```

### Apply And Restore

Prepare a wrapped MCP client configuration. Dry-run is the default and does not write files:

```bash
toollatch apply --client cursor --server filesystem --config ./mcp.json --dry-run --json
```

Write only with an explicit flag. ToolLatch writes a backup before changing the config:

```bash
toollatch apply --client cursor --server filesystem --config ./mcp.json --write
toollatch apply --client cursor --server filesystem --config ./mcp.json --yes
```

`--yes` is a write alias for scripted validation. `claude` is accepted as a client alias for `claude-desktop`.

Restore from a backup:

```bash
toollatch restore --config ./mcp.json --backup ./mcp.json.backup-2026-06-05T00-00-00-000Z.bak
```

### Wrap

Wrap a stdio MCP server:

```bash
toollatch wrap --server filesystem -- node ./server.js
toollatch wrap --server filesystem --confirm-timeout 30000 -- node ./server.js
toollatch wrap --print-config -- node ./server.js
```

The proxy forwards JSON-RPC messages and intercepts `tools/call` requests before they reach the real server. Confirmation supports allow once, allow session, and block in interactive terminals. Non-interactive sessions deny confirmation by default.

### Logs

Read recent audit events:

```bash
toollatch logs
toollatch logs --limit 20
toollatch logs --decision block
toollatch logs --json
```

Export redacted logs:

```bash
toollatch logs export --format json --out audit-export.json
toollatch logs export --format csv --decision block --out audit-export.csv
```

Audit logs are JSONL. Tool arguments are summarized and sensitive keys such as token, secret, password, api_key, authorization, cookie, and obvious secret assignments are redacted.

## Packages

- `@mcp-toollatch/cli` - command entrypoints and user-facing output
- `@mcp-toollatch/core` - shared types, errors, risk levels, paths, and redaction utilities
- `@mcp-toollatch/scanner` - MCP config discovery, static scan, and safe tools/list probing
- `@mcp-toollatch/policy` - YAML policy loading, profiles, validation, extraction, and decisions
- `@mcp-toollatch/proxy` - stdio JSON-RPC forwarding, confirmation, and `tools/call` interception
- `@mcp-toollatch/audit` - JSONL audit write/read/query/export
- `@mcp-toollatch/rules` - built-in sensitive path, command, tool metadata, and classifier rules
- `@mcp-toollatch/config` - safe client config dry-run/apply/restore helpers
- `@mcp-toollatch/doctor` - local diagnostics and repair suggestions

## Roadmap

See [ROADMAP.md](./ROADMAP.md), [docs/mvp-scope.md](./docs/mvp-scope.md), and [docs/threat-model.md](./docs/threat-model.md).

For early users, see [docs/trial-guide.md](./docs/trial-guide.md) and [docs/releases/v0.3.0-beta.1.md](./docs/releases/v0.3.0-beta.1.md).

## License

Apache-2.0. See [LICENSE](./LICENSE).
