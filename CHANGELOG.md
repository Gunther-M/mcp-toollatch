# Changelog

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
