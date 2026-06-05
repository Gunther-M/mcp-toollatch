# Architecture

MCP ToolLatch is a pnpm workspace with small packages that can evolve independently.

## Modules

### cli

The user-facing command-line interface. It owns command parsing, output formatting, exit codes, and orchestration between packages. It does not own policy matching, scanning, proxying, or audit persistence.

### scanner

Finds MCP client configuration, parses configured MCP servers, redacts sensitive env values, and reports static risk signals.

### policy

Defines the local policy schema, loads YAML, validates structure, extracts paths/commands/URLs/SQL from tool arguments, and returns explainable `allow`, `confirm`, or `block` decisions.

### proxy

Wraps stdio MCP servers, forwards JSON-RPC messages, and intercepts `tools/call` before they reach the real server.

### audit

Defines audit event shapes, writes JSONL events, reads recent logs, filters events, and redacts sensitive arguments.

### rules

Holds built-in sensitive path patterns, dangerous command patterns, confirmation command patterns, and static server classification rules.

### core

Shared project metadata, types, error classes, exit-code mapping, path normalization, and redaction helpers that are not owned by a single module.

## Initial Runtime Flow

1. `toollatch scan` asks `scanner` to discover MCP configuration and `rules` to classify risk.
2. `toollatch init` asks `policy` to create a default local policy.
3. `toollatch policy check` asks `policy` to load and validate YAML.
4. `toollatch wrap` asks `proxy` to launch and mediate a stdio MCP server.
5. `proxy` calls `policy` before forwarding `tools/call` requests.
6. `audit` records each intercepted tool-call decision as JSONL.
