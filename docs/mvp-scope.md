# MVP Scope

## v0.1.0

Focus: configuration scanning and risk visibility.

- Detect common MCP client config files.
- Parse configured MCP server commands and arguments.
- Identify obvious sensitive paths, broad filesystem access, and dangerous command patterns.
- Print readable scan output from `toollatch scan`.

## v0.2.0

Focus: stdio proxy, policy, and audit.

- Generate starter policy files with `toollatch init`.
- Launch stdio MCP servers through `toollatch wrap`.
- Evaluate tool calls against local policy.
- Support allow, ask, and block decisions.
- Write structured audit logs.

## v0.3.0

Focus: broader clients, rule library, and contributor experience.

- Improve adapters for Cursor, Claude Desktop, and VS Code.
- Add a maintainable risk rule library.
- Add contributor-friendly tests and fixtures.
- Document packaging and installation paths.
