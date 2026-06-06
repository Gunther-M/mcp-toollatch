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

## v0.3.0-beta.1 - Current Beta

- Deep scan via safe `initialize` and `tools/list` probing.
- Policy profiles: `observe`, `balanced`, and `strict`.
- Doctor diagnostics, config path inspection, and built-in rule listing.
- Client config `apply` dry-run/write plus `restore`.
- Redacted audit querying and JSON/CSV export.
- Real-world validation with fake MCP server, tarball install smoke, and MCP Inspector.

## v0.3.x - Beta Stabilization

- Fix beta bugs from real users.
- Expand compatibility testing with real MCP servers.
- Improve docs based on trial feedback.
- Tighten redaction and error messaging where needed.

## v0.4.0 - Phase 3 Direction

- Domain allow/deny rules.
- Audit log rotation and retention controls.
- Safe shell allowlist design.
- More real MCP server compatibility coverage.
- GitHub Actions CI.
- Rule plugin mechanism.

## v0.4.0 - Phase 3 Implementation Focus

- P0 in progress: domain allow/deny, safe shell allowlist, rule explanations, audit rotation/export, CI quality gates, pack smoke, doctor severity output, apply write summaries, malicious metadata detection, and temporary-fixture compatibility tests.
- P1 deferred: custom local rule pack, logs summary/report, policy migration, GitHub MCP mock, DB risk classification, and confirm TUI refinements.
- P2 deferred: Dashboard prototype, team policy management, full sandbox research, and extra install channels.

## Explicitly Out Of Scope For Now

- Web Dashboard.
- RBAC.
- Cloud policy center.
- Complete sandbox or kernel-level isolation.
