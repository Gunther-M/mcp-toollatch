# MCP ToolLatch Phase 2 Acceptance Audit

Date: 2026-06-05

## Conclusion

Phase 2 can be considered implemented as a `v0.3.0-beta.1` local beta candidate. The install, diagnostics, deep scan, policy profiles, apply/restore, audit export, and real process E2E paths are now covered by tests and smoke commands.

Do not present this as a production sandbox. MCP ToolLatch remains a local policy, confirmation, and audit gateway.

## Implemented Scope

- `scan --deep` starts configured stdio servers and probes only `initialize` and `tools/list`.
- Static scan now reports risk score and human-readable risk reasons.
- Policy profiles exist for `observe`, `balanced`, and `strict`.
- PowerShell dangerous command patterns are covered: `iwr/irm | iex`, `powershell ... iex`, and `pwsh ... iex`.
- `doctor` reports scan, policy, audit status, issues, and suggested next commands.
- `apply` is dry-run by default, writes only with `--write`, creates backups, and `restore` recovers from backups.
- `config paths` and `rules list` expose path candidates and built-in rules.
- Audit logs include event versioning and redacted JSON/CSV export.
- CLI package version is `0.3.0-beta.1`.
- CLI tarball installs without unpublished internal workspace package dependencies.
- Docs now cover README, architecture, policy reference, client setup, threat model, changelog, and release notes.

## Tests Added Or Expanded

- `tests/phase-2-acceptance.test.ts`: process-level CLI E2E for deep scan, apply/write/restore, doctor, and redacted logs export.
- `packages/config/src/index.test.ts`: dry-run, write backup, restore, idempotent wrapping, and BOM-tolerant config parsing.
- `packages/doctor/src/index.test.ts`: missing policy and high-risk config diagnostics.
- `packages/audit/src/index.test.ts`: redacted export and BOM/corrupt JSONL tolerance.
- `packages/policy/src/index.test.ts`: observe/balanced/strict profile decisions and PowerShell command boundaries.
- `packages/scanner/src/index.test.ts`: deep scan fixture and BOM config parsing.
- `packages/rules/src/index.test.ts`: expanded dangerous command rule coverage.

## E2E Results

- Phase 1 proxy E2E remains green: real fake MCP server forwards `initialize` and `tools/list`, allows safe reads, blocks `.env`, and records audit.
- Phase 2 CLI E2E is green: built CLI deep-scans the fake server, applies and restores config with backups, runs doctor, and exports redacted logs.
- Tarball smoke is green: `pnpm --dir packages/cli pack` produced `mcp-toollatch-cli-0.3.0-beta.1.tgz`; a fresh `npm install` of that tarball ran `--version` and `--help`.
- Package contents were checked after the final metadata update. The CLI tarball contains `dist/index.js`, `dist/index.d.ts`, `package.json`, `src/index.ts`, and `LICENSE`; test files are not included.

## Architecture Audit

- Dependency direction remains clear: `core` is shared base; `rules` depends on `core`; `scanner` depends on `core/rules`; `policy` depends on `core/rules`; `audit` depends on `core`; `proxy` depends on `core/policy/audit`; `config` depends on `core/proxy/scanner`; `doctor` depends on `audit/core/policy/scanner`; `cli` orchestrates packages.
- A workspace package dependency graph script found no cycles.
- `rg "\bany\b" packages tests --glob "!**/dist/**"` found no explicit `any` usage.
- Internal workspace packages are bundled into the CLI build for installability; third-party dependencies remain normal npm dependencies.

## Verification Commands

- `git status --short --branch`: clean baseline before work, on `master`.
- `git pull --rebase --autostash origin master`: already up to date.
- `pnpm install`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 11 test files / 85 tests.
- `pnpm build`: passed.
- `pnpm lint`: passed.
- `node packages/cli/dist/index.js --help`: passed.
- `node packages/cli/dist/index.js --version`: passed, `0.3.0-beta.1`.
- `node packages/cli/dist/index.js scan --json`: passed, valid JSON.
- `node packages/cli/dist/index.js scan --client cursor --config <fixture> --deep --timeout 5000 --json`: passed, deep scan found 3 fixture tools.
- `node packages/cli/dist/index.js init --profile strict --force`: passed in a temp directory.
- `node packages/cli/dist/index.js policy check`: passed in the same temp directory.
- `node packages/cli/dist/index.js wrap --server fake --print-config -- node tests/fixtures/fake-mcp-server.js`: passed.
- `node packages/cli/dist/index.js logs --json`: passed.
- `node packages/cli/dist/index.js logs export --format csv --decision block --json`: passed.
- `node packages/cli/dist/index.js doctor --json`: passed.
- `node packages/cli/dist/index.js apply --json`, `--write`, and `restore --json`: passed.
- `node packages/cli/dist/index.js config paths --json`: passed.
- `node packages/cli/dist/index.js rules list --json`: passed.
- `pnpm --filter @mcp-toollatch/cli exec toollatch --help`: passed.
- `pnpm --filter @mcp-toollatch/cli exec toollatch scan --json`: passed.
- `pnpm --filter @mcp-toollatch/cli exec toollatch init --force`: passed.
- `pnpm --filter @mcp-toollatch/cli exec toollatch policy check`: passed.
- `pnpm --filter @mcp-toollatch/cli exec toollatch wrap --print-config -- node tests/fixtures/fake-mcp-server.js`: passed.
- `pnpm --filter @mcp-toollatch/cli exec toollatch logs --json`: passed.
- `pnpm --dir packages/cli pack --pack-destination ...`: passed.
- Fresh `npm install` from CLI tarball: passed.

The shell repeatedly printed an unrelated local conda/pydantic warning after successful commands. It did not change command exit codes.

## Fixed During Audit

- Prevented `apply --json` from exposing raw `originalConfig`/`updatedConfig` and config secrets.
- Made scanner and config parsing tolerate UTF-8 BOM files created by Windows tooling.
- Made audit JSONL reading tolerate a BOM on the first line while still skipping corrupted lines.
- Fixed `logs export` option merging so parent `logs` filters and child options work together.
- Fixed package/install readiness by bundling internal workspace packages into the CLI dist and keeping npm-installable third-party dependencies external.
- Added `dist` to lint ignore so generated build output is not linted.
- Updated package versions and CLI version to `0.3.0-beta.1`.

## Acceptable Remaining Limits

- `scan --deep` probes line-delimited stdio JSON-RPC and does not call `tools/call`; it is a compatibility/risk hint, not a trust proof.
- `apply` rewrites JSON/JSONC as formatted JSON and does not preserve comments.
- Interactive confirmation was not manually exercised through a real terminal session in this audit; non-interactive behavior and proxy decisions are covered.
- Logs rotation and domain allow/deny policy are not included in this beta.
- No npm publish or git tag was created by this audit.

## Unacceptable Issues

None found after fixes and final verification.

## Release Recommendation

Recommend marking the current code as `v0.3.0-beta.1` or a `v0.3.0` RC candidate after human review. Before a broader release, run MCP Inspector or an official SDK-based MCP server through `toollatch wrap` and document compatibility.

## Next Step

The most valuable next step is manual compatibility validation with MCP Inspector/official SDK stdio servers, followed by a release checklist that creates the git tag and prepares npm publication.
