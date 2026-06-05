# Roadmap

## v0.1.0 - Configuration Scanning

- Detect common MCP client configuration locations.
- Parse known client config shapes.
- Surface server commands, filesystem access, and obvious risk signals.
- Print human-readable scan results from `toollatch scan`.

## v0.2.0 - Policy, Proxy, and Audit

- Generate a local starter policy with `toollatch init`.
- Wrap stdio MCP servers with `toollatch wrap`.
- Evaluate high-risk tool calls against policy.
- Record structured audit logs for decisions and approvals.

## v0.3.0 - Client Adapters and Rule Packs

- Add richer Cursor, Claude Desktop, and VS Code setup flows.
- Publish a first community-editable rule library.
- Improve contributor docs, tests, and examples.
- Prepare early package publishing strategy.
