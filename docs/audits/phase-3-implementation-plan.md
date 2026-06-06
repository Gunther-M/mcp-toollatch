# Phase 3 Implementation Plan

Date: 2026-06-06
Branch: master
Requirement source: `W:/MCP ToolLatch/docs/MCP_ToolLatch_三期功能需求与验收计划.xlsx`

## Scope Principle

Phase 3 focuses on stability, real MCP compatibility, policy/rule clarity, audit durability, CI quality gates, and open-source collaboration. MCP ToolLatch remains a local policy, approval, and audit gateway. This implementation will not add Web Dashboard, RBAC, SSO, cloud policy center, SaaS features, npm publish, release creation, git tags, or a production sandbox.

## P0 Breakdown

- CI/CD and engineering gates: GitHub Actions install/typecheck/test/build/lint, pack/fresh install smoke, package content checks, dependency boundary checks.
- Policy and rules: domain allow/deny, safe shell allowlist, standardized rule IDs and explanations, malicious tool metadata warnings, bypass regression coverage.
- Audit: log rotation, multi-file reads, export formats, redaction verification, corrupt JSONL tolerance.
- Compatibility: fake/fault server E2E, filesystem server style compatibility in temporary directories, MCP Inspector regression instructions, extended Cursor/Claude/VS Code config fixtures.
- UX: doctor severity/category/suggested command/doc link fields, apply dry-run/write summary and rollback guidance, concise README trial path.
- Release readiness: npm pack and npm publish dry-run documentation/checks, package metadata and sensitive file scan, release-note preparation without tag/publish/release.
- Open-source collaboration: good first issue triage list and contribution entry points.

## P1 Breakdown

- GitHub MCP server mock compatibility.
- HTTP/fetch fixture E2E beyond the policy/domain unit and proxy tests.
- DB risk classification for destructive SQL.
- Local custom YAML rule pack v0.
- `rules list` filtering by category/severity/source.
- Confirm TUI refinement.
- `logs summary` and static report generation.
- Policy migration command.
- GitHub release automation draft.
- Contributor rule guide expansion and security response SLA details.
- Broader Windows/macOS/Linux CI matrix tuning after the base workflow is stable.

## P2 Breakdown

- Local read-only Dashboard prototype evaluation.
- Team policy management research.
- Complete sandbox research.
- Additional install channels such as Homebrew/Scoop.

## This Round Implementation Scope

This round targets the practical P0 surface that can be implemented and verified inside the current repository:

- Add policy schema fields for `allow_domains`, `deny_domains`, `allow_commands` / safe shell allowlist, and audit rotation settings.
- Keep policy decisions inside `@mcp-toollatch/policy`; keep rule descriptors and extraction helpers in `@mcp-toollatch/rules`; keep CLI as command/output orchestration only.
- Add audit rotation and multi-file read/export support in `@mcp-toollatch/audit`.
- Make proxy decisions and audit events carry standardized rule metadata.
- Expand scanner/rules metadata detection for tool poisoning phrases.
- Improve doctor issue shape with severity, category, suggested command, and doc link.
- Improve apply summaries without exposing full config contents or secrets.
- Add GitHub Actions workflow and local scripts/tests for dependency boundary, CI config, pack/fresh install, sensitive file checks, and docs command checks.
- Update README, ROADMAP, CHANGELOG, policy reference, threat model, demo/trial docs, MCP Inspector docs, and community triage docs.

## Deferred Items And Reasons

- Real GitHub MCP server against live GitHub tokens: deferred to avoid reading, creating, or logging real tokens.
- Real cloud DB/Postgres integration: deferred because production-like credentials and destructive operations are out of scope.
- Web Dashboard/static HTML report: deferred; Phase 3 requirement explicitly keeps Web Dashboard out of scope and this round focuses on CLI/backend safety.
- Policy migration command and custom rule pack loader: deferred to P1 because schema migration and plugin lifecycle need a separate compatibility pass.
- `logs summary` and report generation: deferred to P1 to keep audit rotation/export stable first.
- `npm publish --dry-run`: deferred because this task explicitly forbids npm publish actions.
- npm publish, tags, and Releases: forbidden by the task and out of this implementation round.

## Architecture Risks

- Domain extraction can overmatch free-form strings; mitigation is to extract only URL-like values and curl/wget style command URLs, normalize hostnames, and fail closed only where the policy explicitly requests allowlist enforcement.
- Safe shell allowlist can weaken security if implemented as broad substring matching; mitigation is exact normalized command matching, anchored wildcard patterns, and rejection of shell control operators for allowlist matches.
- Audit rotation can reorder events if file discovery is naive; mitigation is deterministic active + rotated file ordering and tests over multiple files.
- Rule explanations can drift between rules, policy, proxy, and logs; mitigation is central descriptors and snapshot-like tests for policy decisions.
- CI/fresh install smoke can be flaky on external network; mitigation is local pack/fresh install with no real MCP network dependencies.

## Frontend And Screenshot Plan

This round does not include Web frontend, Dashboard, visualization page, or HTML report page. Therefore no browser screenshot acceptance is required. The acceptance audit must explicitly state: 本轮三期实现不包含 Web 前端 / Dashboard，因此无需截图验收。
