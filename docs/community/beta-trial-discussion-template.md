# MCP ToolLatch v0.3.0-beta.1 Beta Trial Feedback

MCP ToolLatch is a local policy, approval, and audit gateway for MCP tool calls.

Current version: `v0.3.0-beta.1`

## Who Should Try This

- Cursor / Claude Desktop / VS Code MCP users
- MCP server developers
- AI Agent toolchain developers
- Security researchers

## Before You Try

- Prefer temporary directories and the fake MCP server fixture.
- Do not upload real `.env` files.
- Do not publicly share tokens, secrets, SSH keys, certificates, cookies, authorization headers, or private logs.
- This beta is not a production-grade complete sandbox.

## Suggested Trial Flow

1. Read the README.
2. Read `docs/trial-guide.md`.
3. Run `toollatch scan`.
4. Run `toollatch init --profile strict`.
5. Run `toollatch doctor`.
6. Try the fake server `wrap` flow.
7. Inspect `logs`.

## Feedback We Want

- Was installation smooth?
- Was the documentation clear?
- Did `scan` identify your MCP config correctly?
- Was policy behavior too strict or too loose?
- Was `wrap` / proxy stable?
- Did `apply` / `restore` feel safe and understandable?
- Were audit logs useful?
- Did domain allow/deny, safe shell allowlist, or audit rotation affect your trial?
- Does ToolLatch support your MCP client or server?

## Feedback Format

- OS:
- Node version:
- ToolLatch version:
- MCP client:
- MCP server:
- Commands:
- Expected:
- Actual:
- Sanitized logs:

## Links

- README: `README.md`
- Trial guide: `docs/trial-guide.md`
- Release notes: `docs/releases/v0.3.0-beta.1.md`
- Security policy: `SECURITY.md`
- Beta feedback issue template: `.github/ISSUE_TEMPLATE/beta_trial_feedback.md`
- Security report template: `.github/ISSUE_TEMPLATE/security_report.md`
- Phase 3 triage guide: `docs/community/phase-3-feedback-triage.md`
