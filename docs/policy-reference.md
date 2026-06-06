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
  - id: RULE-PATH-001
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

  - id: RULE-NET-001
    description: Block explicitly denied network destinations.
    severity: critical
    match:
      category: network
    deny_domains:
      - "169.254.169.254"
      - "*.example-deny.test"
    action: block

  - id: RULE-NET-002
    description: Enforce a network allowlist when configured.
    severity: high
    match:
      category: network
    allow_domains:
      - "api.example.com"
      - "*.trusted.test"
    action: block

  - id: RULE-CMD-001
    description: Block dangerous shell command execution.
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

  - id: RULE-CMD-ALLOW-001
    description: Allow only explicitly configured safe shell commands.
    severity: low
    match:
      category: shell
    allow_commands:
      - "node --version"
      - "echo tool-latch-smoke"
    action: allow

audit:
  enabled: true
  path: .toollatch/audit.jsonl
  rotation:
    max_file_size_mb: 5
    max_files: 5
```

## Fields

- `version` - policy file version.
- `mode` - `observe` or `enforce`.
- `defaults.unknown_tool` - fallback decision for unknown tools.
- `defaults.log_all_calls` - whether intercepted tool calls should be audited.
- `defaults.non_interactive_confirm` - `deny` or `allow` when confirmation is needed but no TTY is available.
- `rules[].match.category` - `filesystem`, `shell`, `network`, `database`, or `unknown`.
- `rules[].action` - `allow`, `confirm`, or `block`.
- `rules[].allow_paths` - path globs allowed for matching filesystem tools.
- `rules[].deny_paths` - path globs blocked before allow rules.
- `rules[].allow_domains` - exact or `*.example.com` domain allowlist entries for network destinations.
- `rules[].deny_domains` - exact or wildcard domain deny entries; deny wins before allow.
- `rules[].allow_commands` - explicit safe shell command allowlist entries. Exact matches are safest; wildcard matches are anchored and shell control operators are rejected.
- `rules[].deny_commands` - shell command patterns blocked or confirmed.
- `rules[].require_confirm` - require local confirmation for a matching rule.
- `audit.rotation.max_file_size_mb` - rotate before appending when the active JSONL log would exceed this size.
- `audit.rotation.max_files` - retain the active log plus rotated files up to this count.
- `audit` - local audit log settings.

## Rule Explanation Contract

Policy decisions and proxy block responses include:

- `matchedRuleId`
- `matchedRuleTitle`
- `risk`
- `reason`
- `matchedValue` when available
- `suggestedFix`

Audit events include `version: 1` and are exported with redaction by:

```bash
toollatch logs export --format json --out audit-export.json
toollatch logs export --format csv --out audit-export.csv
toollatch logs export --format md --out audit-export.md
toollatch rules list --json
```

`toollatch rules list` prints the built-in risk rules plus sensitive path, allowed path, dangerous command, confirmation command, and denied domain patterns used by generated policy defaults.
