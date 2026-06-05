# MVP Scope

## v0.1.0

Focus: configuration scanning and risk visibility.

- Detect common Cursor, Claude Desktop, and VS Code MCP client config files.
- Parse configured MCP server commands, arguments, cwd, and env.
- Redact env values that look like tokens, passwords, keys, cookies, or secrets.
- Identify filesystem, shell, git, GitHub, database, network, and unknown risk signals.
- Print readable scan output from `toollatch scan`.
- Emit script-friendly JSON with `toollatch scan --json`.

## v0.2.0

Focus: stdio proxy, policy, and audit.

- Generate starter policy files with `toollatch init`.
- Validate policy files with `toollatch policy check`.
- Launch stdio MCP servers through `toollatch wrap --server <name> -- <command>`.
- Print wrapped config snippets with `toollatch wrap --print-config`.
- Evaluate `tools/call` requests against local policy before forwarding.
- Support `allow`, `confirm`, and `block` decisions.
- Write structured JSONL audit logs and query them with `toollatch logs`.

## v0.3.0

Focus: broader clients, rule library, and contributor experience.

- Improve adapters for Cursor, Claude Desktop, and VS Code.
- Add a maintainable risk rule library.
- Add contributor-friendly tests and fixtures.
- Document packaging and installation paths.
