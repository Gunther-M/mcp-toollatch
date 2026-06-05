# MCP ToolLatch v0.3.0-beta.1 Release Notes

This beta focuses on making MCP ToolLatch installable, diagnosable, and easier to attach to real client configs.

## Highlights

- `toollatch scan --deep` starts configured stdio MCP servers and safely requests `initialize` and `tools/list`.
- `toollatch init --profile observe|balanced|strict` generates policies for different rollout stages.
- `toollatch doctor` reports local setup problems and suggested next commands.
- `toollatch apply` is dry-run by default, writes only with `--write`, and creates a backup before changing config files.
- `toollatch restore` recovers a client config from an apply backup.
- `toollatch logs export` writes redacted JSON or CSV audit exports.
- `toollatch config paths` and `toollatch rules list` expose client path candidates and built-in rule references.

## Boundaries

- This release does not provide kernel sandboxing, RBAC, SaaS policy management, or a web dashboard.
- Deep scan does not call tools and does not prove a server is safe.
- Manual MCP Inspector or official SDK compatibility testing is still recommended before broad external release.
