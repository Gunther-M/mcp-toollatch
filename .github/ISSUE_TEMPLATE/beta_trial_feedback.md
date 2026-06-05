---
name: Beta trial feedback
about: Share v0.3.0-beta.1 trial feedback for MCP ToolLatch
title: "[Beta Trial] "
labels: beta-feedback
assignees: ""
---

MCP ToolLatch `v0.3.0-beta.1` is a beta local policy/audit gateway for MCP tool calls. It is not a production-grade complete sandbox.

Before posting, redact all secrets. Do not paste `.env` files, tokens, API keys, SSH private keys, certificates, cookies, authorization headers, or private logs.

## Feedback Type

- [ ] Installation
- [ ] `scan`
- [ ] `scan --deep`
- [ ] `policy` / `init`
- [ ] `wrap` / proxy
- [ ] `apply` / `restore`
- [ ] `audit` / `logs`
- [ ] MCP Inspector
- [ ] Documentation
- [ ] Other

## Environment

- OS: Windows / macOS / Linux
- OS version:
- Node.js version:
- npm / pnpm version:
- MCP ToolLatch version:
- Install method: source / tarball / npm / other
- MCP client: Cursor / Claude Desktop / VS Code / MCP Inspector / other
- MCP server type: filesystem / GitHub / Postgres / custom / fake server / other

## Reproduction Steps

1.
2.
3.

- Commands run:
- Current working directory:
- Config file type: Cursor / Claude Desktop / VS Code / Inspector / other
- Real MCP server used? yes / no

## Expected Result

What did you expect to happen?

## Actual Result

What happened instead?

## Logs And Output

Paste only sanitized output.

- Do not paste `.env` contents.
- Do not paste tokens, API keys, SSH private keys, certificates, cookies, or authorization headers.
- If output includes local paths, confirm whether those paths are safe to share.
- Prefer output from `toollatch scan --json`, `toollatch doctor --json`, or `toollatch logs --json` after redaction.

## Security Impact

- [ ] Possible sensitive information leak
- [ ] False positive / expected call was blocked
- [ ] False negative / dangerous call was not blocked
- [ ] UX or documentation issue only
- [ ] Unsure

## Additional Context

Anything else that would help reproduce or understand the feedback?
