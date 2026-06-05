# Architecture

MCP ToolLatch is a pnpm workspace with small packages that can evolve independently.

## Modules

### cli

The user-facing command-line interface. It owns command parsing, output formatting, exit codes, and orchestration between packages. It does not own policy matching, scanning, proxying, or audit persistence.

### scanner

Finds MCP client configuration, parses configured MCP servers, redacts sensitive env values, reports static risk signals, and optionally performs safe deep scans by calling `initialize` and `tools/list`.

### policy

Defines the local policy schema, loads YAML, validates structure, extracts paths/commands/URLs/SQL from tool arguments, and returns explainable `allow`, `confirm`, or `block` decisions.

### proxy

Wraps stdio MCP servers, forwards JSON-RPC messages, and intercepts `tools/call` before they reach the real server.

### audit

Defines audit event shapes, writes JSONL events, reads recent logs, filters events, exports redacted JSON/CSV, and redacts sensitive arguments.

### rules

Holds built-in sensitive path patterns, dangerous command patterns, confirmation command patterns, and static server classification rules.

### core

Shared project metadata, types, error classes, exit-code mapping, path normalization, and redaction helpers that are not owned by a single module.

### config

Plans and applies MCP client configuration changes. It owns dry-run output, idempotent wrapping, backup creation, and restore helpers. It does not scan risk, evaluate policy, or print CLI output.

### doctor

Aggregates scanner, policy, and audit status into local diagnostics with repair suggestions. It does not modify files and does not implement policy decisions.

## Initial Runtime Flow

1. `toollatch scan` asks `scanner` to discover MCP configuration and `rules` to classify risk.
2. `toollatch scan --deep` asks `scanner` to start configured stdio servers and collect `tools/list` metadata with a timeout.
3. `toollatch init --profile` asks `policy` to create an observe, balanced, or strict local policy.
4. `toollatch doctor` asks `doctor` to aggregate scan, policy, and audit diagnostics.
5. `toollatch apply` asks `config` to prepare or write a backed-up wrapped client config.
6. `toollatch policy check` asks `policy` to load and validate YAML.
7. `toollatch wrap` asks `proxy` to launch and mediate a stdio MCP server.
8. `proxy` calls `policy` before forwarding `tools/call` requests.
9. `audit` records each intercepted tool-call decision as JSONL.
