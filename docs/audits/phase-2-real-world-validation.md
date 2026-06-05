# MCP ToolLatch Phase 2 Real-World Validation

Date: 2026-06-05

## 1. Baseline

- Branch: `master`
- Starting commit: `fbb3ec74af54291df3b7f02f74a106c627820488`
- `git status --short --branch`: clean at start
- `git pull --rebase --autostash origin master`: already up to date
- Validation temp root: `tmp/realworld-validation/` inside the repository

The shell repeatedly printed an unrelated local conda/pydantic warning after commands. It did not change successful command exit codes.

## 2. Source Quality Checks

All required source checks passed after the compatibility fixes:

- `pnpm install`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed, 11 test files / 89 tests
- `pnpm build`: passed
- `pnpm lint`: passed

## 3. Dist CLI Smoke

Built dist entry used: `node packages/cli/dist/index.js`.

Passed:

- `--help`
- `--version`: `0.3.0-beta.1`
- `scan --json`
- `scan --deep --json`
- `scan --client cursor --config <fixture> --deep --timeout 5000 --json`
- `doctor --json`
- `init --profile observe --force`
- `init --profile balanced --force`
- `init --profile strict --force`
- `policy check`
- `wrap --print-config -- node tests/fixtures/fake-mcp-server.js`
- `logs --json`
- `rules list --json`
- `config paths --json`

Every JSON output parsed successfully. An invalid apply combination, `apply --dry-run --yes`, exited with code 3 and printed a concise user-facing error without a stack trace.

## 4. Clean Install Test

Used:

- `pnpm --dir packages/cli pack --pack-destination tmp/realworld-validation/packs`
- `npm init -y`
- `npm install <local tgz> --no-audit --no-fund`

Fresh install smoke passed:

- `npx toollatch --help`
- `npx toollatch --version`
- `npx toollatch scan --json`
- `npx toollatch init --profile strict --force`
- `npx toollatch policy check`
- `npx toollatch doctor --json`
- `npx toollatch logs --json`

Tarball contents were checked with `tar -tf`. The package included `dist/index.js`, `dist/index.d.ts`, `package.json`, `src/index.ts`, and `LICENSE`; it did not include `.env`, private keys, audit logs, node_modules, test files, or validation temp files.

## 5. Real Proxy E2E

Started a real process-level proxy:

```bash
node packages/cli/dist/index.js wrap --server fake --policy <tmp policy> --audit-log <tmp audit> -- node tests/fixtures/fake-mcp-server.js
```

Validated by sending line-delimited JSON-RPC over stdin:

- `initialize`: forwarded and returned fake server info
- `tools/list`: forwarded and returned fixture tools
- invalid JSON: returned JSON-RPC parse error
- safe `read_file ./src/ok.txt`: allowed
- `read_file .env`: blocked
- `read_file ./secret.pem`: blocked
- `read_file ./.ssh/id_rsa`: blocked
- `shell_run rm -rf /tmp/toollatch-danger`: blocked with `RULE-004`
- child process abnormal exit: proxy exited instead of hanging

Protocol checks passed:

- stdout contained only JSON-RPC lines
- fake server stderr did not pollute stdout
- block responses were valid JSON-RPC errors
- audit log included allow and block decisions
- audit/log output did not leak request token, `.env`, private key, or PEM contents

Observed design boundary: under the generated balanced policy, non-interactive `shell_run echo hello` is treated as confirmation-required shell access and is denied by the non-TTY default. This is safe behavior but means shell echo is not an allow-path example unless a future policy feature adds explicit safe command allow rules.

## 6. MCP Inspector

Attempted:

```bash
npx @modelcontextprotocol/inspector -- node packages/cli/dist/index.js wrap --server fake -- node tests/fixtures/fake-mcp-server.js
```

Result: not completed in this environment. The installed Inspector package emitted an engine warning:

- required Node: `>=22.7.5`
- current Node: `v22.1.0`

The npx/Inspector process was stopped after the limited launch attempt. No business code was changed for this environment issue. The real process-level proxy E2E above is retained as the local substitute evidence.

## 7. Apply / Restore Fixture Validation

Validated temporary fixture configs for:

- Cursor: `--client cursor`
- Claude Desktop: `--client claude` alias, normalized to `claude-desktop`
- VS Code: `--client vscode`

Passed:

- `apply --dry-run --json` did not modify files
- dry-run output included a safe `changes` summary
- dry-run output did not leak token, password, or apiKey values
- `apply --yes --json` wrote the wrapped config and created a backup
- repeated `apply --yes --json` was idempotent
- `restore --json` restored from the backup
- corrupted JSON config failed with a concise parse error and did not overwrite the file

## 8. Scan --deep Fault Scenarios

A temporary MCP config included normal, slow, bad JSON, stderr-noise, and abnormal-exit servers.

Results:

- normal fake server: `ok`, tools listed
- stderr-noise server: `ok`, stderr content did not enter JSON stdout
- slow server: `failed` after timeout
- bad JSON server: `failed`
- abnormal exit server: `failed`
- overall `scan --deep --json` output remained valid JSON

## 9. Security And Redaction

Passed:

- scan did not print raw env token or authorization values
- audit JSONL did not include raw token, `.env`, PEM, or private key contents
- `logs export --format json` remained redacted
- `logs export --format csv` remained redacted
- package tarball did not include sensitive files
- `git status --short` did not show sensitive files

## 10. Documentation Command Validation

Validated README/client setup/release-note commands that can run locally, using the fake MCP server where docs use a placeholder `./server.js`.

Passed:

- scan, deep scan, init, policy check, doctor, config paths, rules list
- wrap print-config with fake server
- apply dry-run, apply write via `--yes`, restore
- logs and logs export

Docs reviewed:

- README clearly states beta-oriented status and that MCP ToolLatch is not a complete sandbox.
- Threat model now explicitly mentions no kernel isolation and no complete prompt injection coverage.
- `docs/integration/mcp-inspector.md` does not exist.
- `docs/demo` and `scripts/demo` do not exist.

## 11. Fixed Issues

- Added CLI compatibility for `apply --dry-run`.
- Added `apply --yes` as a write alias for scripted validation.
- Added `--client claude` alias mapped to `claude-desktop`.
- Added safe apply change summaries that do not expose raw config text or secret env/args.
- Updated README and client setup docs for explicit dry-run/write aliases.
- Clarified threat model wording for kernel isolation.
- Added tests for the new apply aliases and safe change summaries.

## 12. Remaining Issues

- MCP Inspector was not fully validated because this environment runs Node `v22.1.0`, while Inspector `0.22.0` requires Node `>=22.7.5`.
- Generated balanced policy denies non-interactive shell `echo` as confirmation-required shell access. This is safe, but it limits the ability to demonstrate a harmless shell allow without a future explicit command allowlist.
- No `docs/integration/mcp-inspector.md`, `docs/demo`, or `scripts/demo` currently exists.

## 13. Tag And Trial Recommendation

Recommendation: acceptable for small-scope external beta trials as `v0.3.0-beta.1`, provided users understand it is a local policy/audit gateway, not a production sandbox.

Before broader release, rerun MCP Inspector on Node `>=22.7.5` and document the result.
