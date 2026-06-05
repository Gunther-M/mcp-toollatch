# Policy Reference

The policy format is intentionally small. It is YAML and validated with Zod before the proxy starts.

Generate profiles with:

```bash
toollatch init --profile observe
toollatch init --profile balanced
toollatch init --profile strict
```

- `observe` logs what would have matched but allows the call.
- `balanced` blocks sensitive paths and dangerous commands, and confirms high-impact or unknown calls.
- `strict` blocks stricter unknown/high-impact calls by default.

## Example

```yaml
version: 1
mode: enforce

defaults:
  unknown_tool: confirm
  log_all_calls: true
  non_interactive_confirm: deny

rules:
  - id: RULE-001
    description: Block direct access to common secret files.
    severity: critical
    match:
      category: filesystem
    deny_paths:
      - .env
      - .env.*
      - ~/.ssh/**
      - ~/.aws/**
      - ~/.config/**
      - "**/*.pem"
      - "**/*.key"
      - "**/*.crt"
      - "**/*.p12"
      - "**/*.pfx"
    action: block

  - id: RULE-004
    description: Require approval before shell command execution.
    severity: critical
    match:
      category: shell
    deny_commands:
      - "rm -rf"
      - "sudo"
      - "curl * | sh"
      - "wget * | sh"
      - "iwr * | iex"
      - "irm * | iex"
      - "powershell * iex"
      - "chmod 777"
      - "dd if="
    action: block

audit:
  enabled: true
  path: .toollatch/audit.jsonl
```

## Planned Fields

- `version` - policy file version.
- `mode` - `observe` or `enforce`.
- `defaults.unknown_tool` - fallback decision for unknown tools.
- `defaults.log_all_calls` - whether intercepted tool calls should be audited.
- `defaults.non_interactive_confirm` - `deny` or `allow` when confirmation is needed but no TTY is available.
- `rules[].match.category` - `filesystem`, `shell`, `network`, `database`, or `unknown`.
- `rules[].action` - `allow`, `confirm`, or `block`.
- `rules[].allow_paths` - path globs allowed for matching filesystem tools.
- `rules[].deny_paths` - path globs blocked before allow rules.
- `rules[].deny_commands` - shell command patterns blocked or confirmed.
- `rules[].require_confirm` - require local confirmation for a matching rule.
- `audit` - local audit log settings.

Audit events include `version: 1` and are exported with redaction by:

```bash
toollatch logs export --format json --out audit-export.json
toollatch logs export --format csv --out audit-export.csv
toollatch rules list --json
```

`toollatch rules list` prints the built-in risk rules plus sensitive path, allowed path, dangerous command, and confirmation command patterns used by generated policy defaults.
