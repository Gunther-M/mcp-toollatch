# Phase 3 Acceptance Audit

Date: 2026-06-06
Branch: master
Requirement source: `W:/MCP ToolLatch/docs/MCP_ToolLatch_三期功能需求与验收计划.xlsx`

## 1. Phase 3 Requirement Source

This implementation follows the Phase 3 workbook plus the existing README, ROADMAP, CHANGELOG, and Phase 1/Phase 2 audit reports. The workbook defines Phase 3 as stability, real MCP server compatibility, policy/rule enhancement, audit durability, CI/CD, open-source collaboration, and documentation sync. It explicitly excludes Web Dashboard, RBAC, cloud policy center, SaaS, and a complete production sandbox.

## 2. Implemented Functionality

- Added policy schema fields for `allow_domains`, `deny_domains`, `allow_commands`, and `audit.rotation`.
- Added domain extraction/matching for URL arguments and curl/wget-style shell commands.
- Added explicit safe shell allowlist decisions with dangerous-command deny precedence.
- Standardized built-in rule IDs and explanations, including `RULE-PATH-001`, `RULE-CMD-001`, `RULE-CMD-ALLOW-001`, `RULE-NET-001`, `RULE-NET-002`, `RULE-META-001`, and `RULE-AUDIT-001`.
- Added audit JSONL rotation, rotated-file reads, and Markdown export.
- Added richer audit/proxy decision fields: rule title, matched value, and suggested fix.
- Added `scan --server` filtering and stronger suspicious tool metadata detection.
- Added doctor issue `category`, `suggestedCommand`, and `docLink`.
- Added safer apply summaries with impact summary, backup preview, and rollback command.
- Added GitHub Actions quality workflow and pack/fresh-install smoke.
- Added Phase 3 feedback triage and draft v0.4.0-beta.1 release notes.

## 3. Deferred Functionality And Reasons

- `npm publish --dry-run`: deferred because this task explicitly forbids npm publish actions.
- Real token-backed GitHub MCP server validation: deferred to avoid real tokens and sensitive logs.
- Real DB/Postgres integration: deferred because production credentials and destructive SQL are out of this round.
- Custom local rule packs, policy migration, `logs summary`, and static HTML report: deferred to P1.
- Web Dashboard / Dashboard screenshots: deferred because Web frontend is out of Phase 3 P0 scope.
- RBAC, SSO, cloud policy center, SaaS, and complete sandbox: explicitly out of scope.

## 4. Core Module Changes

- `core`: added `matchedValue` and stronger private-key/certificate redaction.
- `rules`: added rule categories, new rule IDs, domain extraction/matching, safe shell matching, denied domain defaults, and stronger metadata warning phrases.
- `policy`: added new schema fields and centralized path/domain/command/generic decision order.
- `audit`: added rotation, multi-file reads, Markdown export, and richer event metadata.
- `proxy`: passes audit rotation settings and returns matched values in policy block responses.
- `scanner`: supports server-name filtering and reports `RULE-META-001` warnings from deep metadata.
- `doctor`: emits structured issue category, doc link, and suggested command fields.
- `config`: adds apply impact summaries, backup previews, and rollback command strings.
- `cli`: remains command parsing/output orchestration; it passes new options into modules and supports `wrap --print-config` without a real command for smoke/demo output.

## 5. Architecture Boundary

CLI does not implement policy matching, audit persistence, scanning, proxy interception, config mutation, or diagnostics. Domain and shell decision logic lives in `policy` and reusable match helpers live in `rules`. Audit rotation is contained in `audit`. Config write safety stays in `config`. Doctor aggregates but does not modify files.

## 6. Test Coverage

- Policy/rules: domain allow/deny, curl URL extraction, safe shell allowlist, rule explanation fields, dangerous command precedence, bypass-style assertions.
- Audit: redaction, JSON/CSV/Markdown export, rotation, multi-file read order, damaged JSONL tolerance.
- Proxy E2E: fake server forwards safe calls and blocks sensitive path, dangerous shell, and denied domain calls.
- Scanner: `scan --deep` fake server, server-name filter, malicious metadata warning.
- CLI smoke and docs: `wrap --print-config` placeholder, CI workflow checks, dependency boundary checks, README/policy command documentation.
- Config/doctor: apply summary/rollback and structured doctor issue fields.

Final automated test result: 13 test files passed, 108 tests passed.

## 7. Smoke / Pack / E2E Results

All final checks passed:

- `pnpm install`: passed via `npm exec --package=pnpm@9.15.4 -- pnpm install`; lockfile unchanged.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 13 files / 108 tests.
- `pnpm build`: passed.
- `pnpm lint`: passed.
- CLI smoke passed for `--help`, `--version`, `scan --json`, `scan --deep --json`, `doctor --json`, `init --profile strict --force`, `policy check`, `wrap --print-config`, `logs --json`, `rules list --json`, and `config paths --json`.
- Pack smoke passed: `mcp-toollatch-cli-0.3.0-beta.1.tgz`.
- Fresh install smoke passed: `npm install` tarball, `npx toollatch --version`, `npx toollatch --help`, and `npx toollatch scan --json`.
- Sensitive tracked filename check passed.
- Documentation command check passed, including Markdown audit export.

## 8. CI Result

Added `.github/workflows/ci.yml` with Windows and Ubuntu quality jobs for install/typecheck/test/build/lint and a Linux pack/fresh-install smoke job with a sensitive-file guard. Local CI workflow structure is covered by `tests/phase-3-engineering.test.ts`. Remote GitHub Actions status will be available after push; no hosted PR run exists before this commit is pushed.

## 9. Frontend Screenshot Acceptance

本轮三期实现不包含 Web 前端 / Dashboard，因此无需截图验收。

No local web page, Dashboard, visualization, or HTML report was introduced.

## 10. Security Boundary

MCP ToolLatch remains a local policy/audit gateway, not a production-grade sandbox. Domain rules inspect visible tool arguments and shell command text; they do not isolate hidden network traffic inside a malicious server process. Safe shell allowlist is explicit and narrow; it rejects shell control operators for allowlist matches, and dangerous deny rules run first. Audit exports remain redacted by default. No `.env`, token, private key, certificate, or real sensitive log file was read, printed, committed, or used in tests.

## 11. Known Issues

- Remote GitHub Actions has not run yet because the workflow is new and this branch has not been pushed at audit time.
- `npm publish --dry-run` is deferred by instruction even though the workbook lists publish readiness as a Phase 3 P0/P1 release-prep direction.
- Real external MCP servers that require credentials are documented/deferred; automated compatibility uses fake and temporary fixtures only.
- The CLI package tarball is installable and clean of tests, but formal npm package polish such as package-local README/LICENSE can be revisited before public npm publication.

## 12. Release Recommendation

Recommend entering v0.4.0-beta.1 release收口 after this commit is pushed to both remotes and remote CI is green. Do not create a tag, npm publish, or hosted Release until a human release review confirms the Phase 3 deferred list and the MCP Inspector checklist.
