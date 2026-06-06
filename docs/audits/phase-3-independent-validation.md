# Phase 3 Independent Validation

Date: 2026-06-06
Branch: master
Validated starting commit: `fde9aaf feat: implement phase 3 MCP ToolLatch capabilities`

## 1. Current Branch And Commit

- Branch: `master`
- Starting commit: `fde9aaf`
- Baseline commands:
  - `git status`: clean at start.
  - `git pull --rebase --autostash origin master`: already up to date.
  - `git log -1 --oneline`: `fde9aaf feat: implement phase 3 MCP ToolLatch capabilities`.
- This report and the policy regression fix are committed separately after validation.

## 2. Phase 3 Validation Conclusion

Phase 3 passes independent validation after one blocking policy fix. The validated implementation is suitable to enter v0.4.0-beta.1 release close-out after the follow-up validation commit is pushed and remote GitHub Actions is green.

MCP ToolLatch remains a local policy/audit gateway, not a production-grade sandbox.

## 3. Verified Functionality

- Domain allow/deny works for URL tool arguments and shell command URL extraction.
- Safe shell allowlist works for explicitly configured commands.
- Non-allowlisted shell commands are denied in non-interactive sessions when `allow_commands` is configured.
- Dangerous shell commands still block before allowlist checks.
- Audit log rotation creates rotated files and `logs` reads across them.
- JSON and Markdown audit export work and remain redacted.
- Rule metadata is present in decisions and JSON-RPC block responses: `matchedRuleId`, `matchedRuleTitle`, `reason`, `risk`, `matchedValue`, and `suggestedFix`.
- `scan --server` filters to the requested server.
- Malicious tool metadata is flagged with `RULE-META-001`.
- Slow deep-scan servers report timeout failure without breaking the whole scan.
- Abnormal server exits report failed deep-scan status.
- Doctor issues include severity, category, suggested command, and doc link.
- Apply dry-run/write summaries include impact summary, backup preview, and rollback command without exposing original config or secret-like args.
- `rules list --json` has a stable shape including risk rules and denied domain patterns.

## 4. E2E Test Results

Independent real-process E2E used `tests/fixtures/fake-mcp-server.js` plus temporary fault servers under `tmp/phase3-independent-e2e`:

- `initialize`: forwarded and returned `fake-mcp-server`.
- `tools/list`: forwarded and included `read_file`, `write_file`, `shell_run`, and `fetch_url`.
- Safe `read_file ./src/ok.txt`: allowed.
- `.env`: blocked with `RULE-PATH-001`.
- `secret.pem`: blocked with `RULE-PATH-001`.
- Dangerous `shell_run rm -rf ...`: blocked with `RULE-CMD-001`.
- Safe `shell_run echo safe-shell`: allowed through explicit allowlist.
- Non-allowlisted `shell_run echo unsafe-shell`: blocked in non-interactive mode with `RULE-CMD-ALLOW-001`.
- Allowed domain `https://allowed.example.test/path`: allowed.
- Denied metadata IP `http://169.254.169.254/...`: blocked with `RULE-NET-001`.
- Unlisted domain under allowlist mode: blocked with `RULE-NET-002`.
- Bad JSON line: forwarded to the fake server and returned a valid JSON-RPC parse error.
- Fake server stderr noise stayed off stdout.
- Audit events were recorded and rotated.

Result lines:

- `PASS proxy E2E allow/block/domain/shell/noise/bad-json`
- `PASS audit rotation multi-file query export redaction`
- `PASS scan --server metadata slow timeout abnormal exit`
- `PASS doctor structured diagnostics`
- `PASS apply risk summary rollback redaction`
- `PASS rules list JSON stable shape`

## 5. CLI Smoke Results

All required CLI smoke commands passed:

- `node packages/cli/dist/index.js --help`
- `node packages/cli/dist/index.js --version`
- `node packages/cli/dist/index.js scan --json`
- `node packages/cli/dist/index.js scan --deep --json`
- `node packages/cli/dist/index.js doctor --json`
- `node packages/cli/dist/index.js init --profile strict --force`
- `node packages/cli/dist/index.js policy check`
- `node packages/cli/dist/index.js wrap --print-config`
- `node packages/cli/dist/index.js logs --json`
- `node packages/cli/dist/index.js logs export --format json --out ./tmp-phase3-export.json`
- `node packages/cli/dist/index.js rules list --json`
- `node packages/cli/dist/index.js config paths --json`

Additional Phase 3 option smoke passed:

- `scan --server fake --json`
- `logs export --format md`

Temporary smoke artifacts were removed after validation.

## 6. Pack / Fresh Install Results

Pack/fresh install smoke passed:

- Generated `mcp-toollatch-cli-0.3.0-beta.1.tgz` under `tmp/phase3-validation-packs`.
- Created a fresh npm project under `tmp/phase3-validation-install-smoke`.
- Ran `npm init -y`.
- Installed the local tarball.
- Ran `npx toollatch --help`.
- Ran `npx toollatch --version`.
- Ran `npx toollatch scan --json`.
- Ran `npx toollatch rules list --json`.

Tarball content guard passed. Tarball contents were limited to:

- `dist/index.d.ts`
- `dist/index.js`
- `package.json`
- `src/index.ts`

No `.env`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `.tgz`, `.tools`, `tmp/`, tests, or large logs were found in the package.

## 7. CI Check Results

`.github/workflows/ci.yml` was statically checked:

- Includes `pnpm install --frozen-lockfile`.
- Includes `pnpm typecheck`.
- Includes `pnpm test`.
- Includes `pnpm build`.
- Includes `pnpm lint`.
- Includes CLI pack smoke.
- Includes fresh install smoke.
- Includes Ubuntu and Windows quality matrix.
- Uses `pnpm/action-setup@v4` with pnpm `9.15.4`.
- Does not use `secrets.*`, `GITHUB_TOKEN`, npm publish, tag, release, or release-creation steps.

Remote GitHub Actions must still be checked after this validation commit is pushed.

## 8. Documentation Command Validation

Non-interactive commands from README, trial guide, policy reference, and the Phase 2/3 demo were executed successfully:

- `scan --json`
- `scan --deep --json`
- `config paths --json`
- `rules list --json`
- `init --profile strict --force --output <tmp-policy>`
- `policy check <tmp-policy>`
- `doctor --json --policy <tmp-policy>`
- `wrap --server fake --policy <tmp-policy> --print-config -- node tests/fixtures/fake-mcp-server.js`
- `scan --server fake --deep --json`
- `logs export --format md --out <tmp-file> --json`

Documentation wording was checked for safety boundaries:

- Does not claim npm publish, tag, or Release completion.
- Does not claim production-grade sandboxing.
- Does not claim complete prompt-injection defense.
- Continues to state that Web Dashboard, RBAC, cloud policy center, and complete sandbox are out of scope.

## 9. Frontend Screenshot Acceptance

本轮三期独立测试确认无 Web 前端 / Dashboard，因此无需截图验收。

Search for Dashboard, HTML report, React/Next.js, and visualization terms found only documentation statements that these are deferred or out of scope. No page was introduced, so no screenshots were produced.

## 10. Security Check Results

- `git status --short` showed only expected policy fix files before this report was added.
- Tracked sensitive/temporary filename check passed: no tracked `.env`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa`, `.tgz`, `.log`, `.tools`, or temp paths.
- Audit/log/export validation confirmed fake validation secrets did not appear in stdout, logs, JSON export, or Markdown export.
- Apply dry-run validation confirmed secret-like args did not appear in JSON output.
- Existing test fixtures contain synthetic token/secret sentinel strings only, and tests assert they are redacted from outputs.
- No real `.env`, token, private key, certificate, or sensitive log was read or printed.

## 11. Found And Fixed Issues

Fixed one blocking behavior bug:

- Problem: when `allow_commands` was configured, a non-allowlisted shell command could remain `confirm` without being converted to non-interactive block because `RULE-CMD-ALLOW-001` was returned early.
- Fix: only early-return `RULE-CMD-ALLOW-001` decisions when the action is `allow`; confirm decisions now flow through the existing non-interactive confirmation handling.
- Added regression test: `blocks non-allowlisted shell commands in non-interactive sessions when allow_commands is configured`.

Validation-process note:

- Temporary fault-server files under `tmp/phase3-independent-e2e` were generated for E2E validation and removed before final lint. They were not staged or committed.

## 12. Remaining Issues

- Remote GitHub Actions result is not available until this validation commit is pushed.
- `npm publish --dry-run` remains intentionally unrun because this task forbids npm publish actions.
- Real credential-backed MCP servers remain deferred; validation used fake and temporary fixture servers only.
- Direct `pnpm` was not available on PATH in this Windows shell, so validation used `npx pnpm@9.15.4 ...`, matching the project package-manager version.

## 13. v0.4.0-beta.1 Recommendation

Recommend entering v0.4.0-beta.1 release close-out after this validation commit is pushed and GitHub Actions is green.

Do not publish to npm, create a tag, or create a Release until remote CI passes and a human release checklist review is complete.

## 14. Tag Recommendation

Recommend waiting for GitHub Actions remote CI to be green before any future tag. This validation did not create a tag, Release, or npm publication.
