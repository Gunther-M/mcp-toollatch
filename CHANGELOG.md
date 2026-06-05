# Changelog

## 0.3.0-beta.1

- Added `scan --deep` safe stdio probing for `initialize` and `tools/list`.
- Added policy profiles: `observe`, `balanced`, and `strict`.
- Added `doctor` diagnostics for scan, policy, and audit status.
- Added `apply` dry-run/write and `restore` backup recovery for MCP client configs.
- Added `config paths` and `rules list` inspection commands.
- Added audit event versioning and redacted `logs export` for JSON and CSV.
- Added interactive confirmation timeout and allow-session handling.
- Added PowerShell dangerous command patterns and BOM-tolerant config parsing.
- Updated README, architecture, policy, threat model, and client setup docs.

MCP ToolLatch is still a local policy gateway, not a full sandbox.
