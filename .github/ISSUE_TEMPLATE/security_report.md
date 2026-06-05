---
name: Security report
about: Report a sanitized security concern or minimal reproduction
title: "security: "
labels: security
assignees: ""
---

Do not disclose real vulnerability details, live credentials, private logs, or exploit material in a public issue.

If this involves real sensitive information leakage, policy bypass, arbitrary command execution, real token exposure, private `.env` contents, SSH keys, certificates, or production data, report privately first using [SECURITY.md](../../SECURITY.md).

Public issues are only appropriate for sanitized minimal reproductions, ideally using `tests/fixtures/fake-mcp-server.js` or a temporary directory.

## Issue Type

- [ ] policy bypass
- [ ] redaction failure
- [ ] dangerous command not blocked
- [ ] sensitive path not blocked
- [ ] audit leak
- [ ] config corruption
- [ ] other

## Impact

Describe the affected area and severity without exposing secrets.

## Minimal Reproduction

Use fake data and temporary files only.

1.
2.
3.

- Reproduced with fake server / temporary directory? yes / no
- Real credentials involved? yes / no

## Expected Security Behavior

What should MCP ToolLatch have done?

## Actual Behavior

What happened instead?

## Sanitized Evidence

Paste only redacted logs, policy snippets, or commands. Do not paste real tokens, API keys, `.env` contents, SSH private keys, certificates, cookies, authorization headers, or private infrastructure paths.

## Private Reporting

If you cannot safely describe the issue publicly, stop here and use the private reporting path in [SECURITY.md](../../SECURITY.md).
