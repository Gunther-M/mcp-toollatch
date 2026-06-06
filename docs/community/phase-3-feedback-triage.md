# Phase 3 Trial Feedback Triage

Use this checklist for v0.3.x trial feedback that may become v0.4.0 Phase 3 work.

## Intake Rules

- Ask for OS, Node version, ToolLatch version, MCP client, MCP server type, exact command, expected behavior, actual behavior, and sanitized logs.
- Do not request `.env` files, real tokens, SSH keys, certificates, private logs, or screenshots containing secrets.
- Prefer reproductions that use `tests/fixtures/fake-mcp-server.js`, temporary directories, and redacted policy snippets.
- Route possible credential exposure, policy bypass, arbitrary command execution, or private data leakage through `SECURITY.md`.

## Triage Labels

- `phase-3-policy`: domain allow/deny, path rules, command rules, rule explanation.
- `phase-3-audit`: rotation, export, redaction, damaged JSONL recovery.
- `phase-3-compat`: MCP Inspector, filesystem server, client config fixtures, scan --deep.
- `phase-3-ci`: GitHub Actions, pack smoke, fresh install, package contents.
- `phase-3-docs`: README, trial guide, policy reference, threat model, demo clarity.
- `security-private`: public issue should stay sanitized and link to private report path.

## Good First Issue Ideas

- Add one domain matching fixture for `allow_domains` or `deny_domains`.
- Add one safe shell allowlist test case for PowerShell or bash.
- Add one malicious tool metadata phrase to `RULE-META-001` tests.
- Add one MCP client config fixture with Windows paths containing spaces.
- Add one audit export redaction fixture for a new sensitive key spelling.
- Improve one README or trial-guide command after running it locally.
- Add one `rules list --json` snapshot assertion for a built-in rule.
- Add one MCP Inspector troubleshooting note with a sanitized failure mode.
- Add one package content check for files that must not enter the CLI tarball.

## Release Gate Questions

- Did `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm lint` pass?
- Did pack and fresh install smoke pass?
- Did fake server and filesystem-style temporary directory E2E pass?
- Did any shared logs pass sensitive-value scanning?
- Are unsupported Dashboard, RBAC, cloud policy center, SaaS, and full sandbox requests explicitly deferred?
