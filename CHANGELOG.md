# Changelog

## Unreleased - Phase 3

- Added policy schema support for `allow_domains`, `deny_domains`, `allow_commands`, and `audit.rotation`.
- Added domain extraction and matching for URL arguments plus curl/wget-style shell commands.
- Added explicit safe shell allowlist decisions while preserving dangerous-command deny precedence.
- Added standardized rule IDs and richer policy/audit/proxy explanation fields.
- Added audit log rotation, multi-file reads, and Markdown export.
- Added `scan --server` filtering and expanded suspicious tool metadata detection.
- Added doctor issue categories, suggested commands, and doc links.
- Added safer apply impact summaries, backup previews, and rollback command output.
- Added GitHub Actions CI and pack/fresh-install smoke workflow.
- Added Phase 3 tests and docs for policy reference, threat model, trial flow, MCP Inspector, and feedback triage.

Deferred:

- No Web Dashboard, RBAC, cloud policy center, SaaS, full sandbox, npm publish, git tag, or release creation.
- `npm publish --dry-run`, policy migration, custom rule packs, logs summary/report, and real token-backed GitHub MCP tests remain out of this round.

## 0.3.0-beta.1 - 2026-06-05

Beta release for small-scope local trials. MCP ToolLatch remains a local policy, approval, and audit gateway, not a production-grade sandbox.

- Added `scan --deep` safe stdio probing for `initialize` and `tools/list`.
- Added policy profiles: `observe`, `balanced`, and `strict`.
- Added `doctor` diagnostics for scan, policy, and audit status.
- Added `apply` dry-run/write and `restore` backup recovery for MCP client configs.
- Added `apply --dry-run`, `apply --yes`, and `--client claude` compatibility for scripted real-world validation.
- Added `config paths` and `rules list` inspection commands.
- Added audit event versioning and redacted `logs export` for JSON and CSV.
- Added interactive confirmation timeout and allow-session handling.
- Added PowerShell dangerous command patterns and BOM-tolerant config parsing.
- Added phase 1 and phase 2 real-world acceptance audits.
- Added MCP Inspector validation guidance and a fixture-only local demo.
- Added trial guide, release notes, and security-aware issue/PR templates.
- Updated README, architecture, policy, threat model, client setup, and roadmap docs.

Known limits:

- No kernel-level sandboxing or complete prompt-injection defense.
- No Web Dashboard, RBAC, cloud policy center, or full isolation layer.
- Balanced profile denies non-interactive shell confirmations by default.
