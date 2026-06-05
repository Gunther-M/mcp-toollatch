# Policy Reference

The policy format is intentionally small for the first version. The exact schema may change before v0.1.0.

## Example

```yaml
version: 1
mode: observe

defaults:
  action: ask

rules:
  - id: block-sensitive-files
    description: Block direct access to common secret files.
    match:
      tool: filesystem.read
      paths:
        - "**/.env"
        - "**/*.pem"
        - "**/*.key"
    action: block

  - id: ask-before-shell
    description: Require approval before shell command execution.
    match:
      tool: shell.run
    action: ask

audit:
  enabled: true
  path: .toollatch/audit.log
```

## Planned Fields

- `version` - policy file version.
- `mode` - `observe` or `enforce`.
- `defaults.action` - fallback decision when no rule matches.
- `rules[].match` - tool name, arguments, path, or command pattern selectors.
- `rules[].action` - `allow`, `ask`, or `block`.
- `audit` - local audit log settings.
