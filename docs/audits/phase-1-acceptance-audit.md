# Phase 1 MVP Acceptance Audit

Date: 2026-06-05
Branch: master
Scope: phase 1 scan/init/policy/wrap/proxy/audit/logs/CLI acceptance

## 1. Conclusion

Phase 1 can be considered functionally complete for the local MVP loop defined in the phase 1 requirement workbook: scan local MCP configs, initialize a default policy, evaluate policy decisions, wrap a stdio MCP server, block risky tool calls, and write/read audit logs.

This is not a production sandbox. The right release label is v0.2.0 RC or v0.2.0 MVP, not v0.1.0, because the audited scope includes the runtime proxy and audit loop. Do not market it as complete containment against malicious MCP servers.

## 2. Verified Functionality

- `scan`: verified Cursor, Claude Desktop, and VS Code fixture parsing; server name, command, args, cwd, env summary, JSON output, missing config handling, risk classification variety, and env redaction.
- `init`: verified temporary-directory init, default YAML creation, no silent overwrite, `--force` overwrite, required sensitive path rules, required dangerous command rules, and reload/validation through the policy module.
- `policy`: verified allow, block, and confirm decisions; readable reasons; sensitive path matching including `.env.local`, `../`, `~/.ssh`, Windows-style absolute `.ssh`, `*.pem`, and `*.key`; dangerous command matching with case/spacing/quote boundaries.
- `wrap/proxy`: verified a real child-process E2E using `tests/fixtures/fake-mcp-server.js` through the built CLI dist entry. The test forwards `initialize`, `tools/list`, and allowed `tools/call`; blocks `.env` and dangerous shell calls; returns JSON-RPC error responses; keeps server stderr off protocol stdout; tolerates empty and invalid JSON lines; exits cleanly.
- `audit/logs`: verified allow/block/confirm JSONL writes, automatic log directory creation, missing log handling, damaged JSONL line skipping, `limit`, JSON output, decision filtering, and redaction of token/apiKey/password/secret/authorization/obvious secret values.
- `CLI`: verified built dist entry and workspace bin entry. The workspace bin required linking `@mcp-toollatch/cli` into the root dev dependencies so `pnpm --filter @mcp-toollatch/cli exec toollatch ...` works.
- Architecture: package dependency direction remains clear: `core` is shared base; `rules` depends on `core`; `scanner` depends on `core/rules`; `policy` depends on `core/rules`; `audit` depends on `core`; `proxy` depends on `core/policy/audit`; `cli` orchestrates packages. No explicit `any` usage was found by `rg "\bany\b" packages tests -n`.

## 3. Real E2E Test Results

- Added `tests/fixtures/fake-mcp-server.js`, a minimal stdio JSON-RPC MCP fixture with `initialize`, `tools/list`, and `tools/call` for `read_file`, `write_file`, and `shell_run`.
- Added `tests/phase-1-acceptance.test.ts` with 20 phase-1 acceptance tests.
- Full test suite result after changes: 8 test files passed, 70 tests passed.
- Proxy E2E result: real process-level invocation of the built CLI forwards safe calls, blocks `.env` and `rm -rf`, writes audit events, and exits with code 0.

## 4. Issues Found

- Scanner JSON exposed raw env values in the normalized `env` field even though `envSummary` was redacted.
- Scanner platform path generation used host path behavior, which made Windows/macOS/Linux candidate path tests unreliable on Windows.
- Default sensitive path coverage missed some absolute nested `.ssh` cases and `id_rsa`.
- Policy normalized `**/...` path patterns incorrectly, causing Windows absolute `.ssh` paths to evade matching.
- Unknown tool decisions could be explained as a generic confirmation rule instead of saying the tool was unknown.
- Proxy used Windows shell spawning, which broke commands under paths containing spaces.
- Proxy could close child stdin before asynchronous line handlers finished, causing `ERR_STREAM_WRITE_AFTER_END` under real piped input.
- Workspace bin smoke failed because the root workspace did not link `@mcp-toollatch/cli`.
- CLI bin invocation through pnpm junctions did not execute because direct-run detection compared unresolved paths.
- `wrap --print-config -- node ...` failed without `--server`, while the smoke checklist used that form.
- Audit redaction missed obvious secret assignments stored under generic keys.

## 5. Fixed Issues

- Centralized obvious secret detection in `@mcp-toollatch/core` and reused it through redaction.
- Scanner now redacts env in the structured `env` field and uses platform-aware path joining for candidate config paths.
- Rules now include nested `.ssh`, `.aws`, `.config`, and `id_rsa` sensitive patterns.
- Policy path normalization preserves `**/...` glob intent and produces clearer unknown-tool reasons.
- Proxy spawn no longer uses shell wrapping on Windows and now waits for pending input-line handlers before closing child stdin.
- Proxy writes to child stdin are guarded after stream closure.
- Root package now links `@mcp-toollatch/cli` so workspace bin smoke commands resolve `toollatch`.
- CLI direct-run detection now compares real paths, so dist entry and pnpm bin/junction entry both execute.
- `wrap --print-config` can generate a config with default server name `mcp-server` when `--server` is omitted; actual proxy runtime still requires a server name.
- Added clear tests for scanner fixtures, policy boundaries, audit redaction, proxy process E2E, and CLI print-config behavior.

## 6. Acceptable Remaining Issues

- README currently contains mojibake in the Chinese intro/security lines. English README content and CLI commands are usable; this should be cleaned before a public release page.
- The requirement workbook uses the historical command name `agent-gate`; this repository implements `toollatch`. Project docs are internally consistent with `toollatch`, but the external requirements workbook should be updated.
- This audit uses a line-delimited JSON-RPC stdio fixture. A follow-up should verify compatibility with MCP Inspector or the official SDK transport behavior before stronger release claims.
- `doctor`, dashboard, cloud policy center, RBAC, HTTP/SSE proxying, and a full sandbox are intentionally out of phase 1 scope.

## 7. Unacceptable Issues

None remaining after the fixes in this audit.

## 8. Version Recommendation

Recommend marking this as v0.2.0 RC / v0.2.0 MVP after review, not v0.1.0. The implemented and tested scope is the v0.2.0 proxy/audit loop described by the workbook. Keep the status as pre-alpha or MVP until MCP Inspector/official SDK compatibility is manually verified.

## 9. Verification Commands

All commands below completed successfully with exit code 0. The local PowerShell environment printed unrelated conda entry-point warnings after many commands; those warnings did not affect command exit codes.

- `git status --short --branch`: started clean on `master`.
- `git pull --rebase --autostash origin master`: already up to date.
- `npm exec --yes --package=pnpm@9.15.4 -- pnpm install`: passed.
- `npm exec --yes --package=pnpm@9.15.4 -- pnpm typecheck`: passed.
- `npm exec --yes --package=pnpm@9.15.4 -- pnpm test`: passed, 8 files / 70 tests.
- `npm exec --yes --package=pnpm@9.15.4 -- pnpm build`: passed.
- `npm exec --yes --package=pnpm@9.15.4 -- pnpm lint`: passed.
- `node packages/cli/dist/index.js --help`: passed.
- `node packages/cli/dist/index.js scan --json`: passed and parsed as JSON.
- `node <repo>/packages/cli/dist/index.js init --force` in `tmp/cli-smoke-final`: passed.
- `node <repo>/packages/cli/dist/index.js policy check` in `tmp/cli-smoke-final`: passed.
- `node packages/cli/dist/index.js wrap --server fake --print-config -- node tests/fixtures/fake-mcp-server.js`: passed.
- `node packages/cli/dist/index.js logs --json`: passed and parsed as JSON.
- `npm exec --yes --package=pnpm@9.15.4 -c "pnpm --filter @mcp-toollatch/cli exec toollatch --help"`: passed.
- `npm exec --yes --package=pnpm@9.15.4 -c "pnpm --filter @mcp-toollatch/cli exec toollatch scan --json"`: passed and parsed as JSON.
- `npm exec --yes --package=pnpm@9.15.4 -c "pnpm --filter @mcp-toollatch/cli exec toollatch init --force"`: passed; pnpm runs the command from `packages/cli`.
- `npm exec --yes --package=pnpm@9.15.4 -c "pnpm --filter @mcp-toollatch/cli exec toollatch policy check"`: passed.
- `npm exec --yes --package=pnpm@9.15.4 -c "pnpm --filter @mcp-toollatch/cli exec toollatch wrap --print-config -- node tests/fixtures/fake-mcp-server.js"`: passed.
- `npm exec --yes --package=pnpm@9.15.4 -c "pnpm --filter @mcp-toollatch/cli exec toollatch logs --json"`: passed and parsed as JSON.

## 10. Next Best Step

Run MCP Inspector or an official SDK-based stdio server through `toollatch wrap` and document the compatibility result. After that, clean README mojibake and publish as v0.2.0 RC.
