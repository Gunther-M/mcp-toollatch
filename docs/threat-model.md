# Threat Model

This document describes the current local risk model for MCP ToolLatch.

## Assets

- local files and directories reachable by configured MCP servers
- shell commands launched by MCP tools
- credentials passed through MCP server env or tool arguments
- audit logs that describe tool-call behavior
- local policy files

## Trust Boundaries

- MCP client to MCP ToolLatch proxy over stdio
- MCP ToolLatch proxy to real MCP server over stdio
- local policy file to runtime policy engine
- runtime tool-call arguments to audit JSONL summaries
- MCP ToolLatch apply/restore to client configuration files
- deep scan to configured MCP server process startup

## Risks in Scope

- sensitive file access
- dangerous shell commands
- overly broad filesystem access
- suspicious tool descriptions
- audit visibility gaps
- path traversal to secrets such as `../.env`
- secret leakage through env scanning or audit logs
- high-impact operations that need confirmation
- accidental client config damage during automatic wrapping
- non-interactive confirmation flows that could otherwise hang

## Controls

- Scan MCP configuration for obvious risk indicators.
- Optionally deep scan with `initialize` and `tools/list`; never call `tools/call` during scan.
- Redact suspicious env values during scan.
- Generate local policy files with observe, balanced, and strict profiles.
- Wrap stdio MCP servers so `tools/call` can be inspected before execution.
- Deny sensitive paths and dangerous shell commands by default.
- Ask for interactive confirmation with timeout and non-TTY safe defaults.
- Record redacted audit events for decisions, prompts, and blocked calls.
- Apply client config changes only after dry-run review and explicit `--write`.
- Back up client config before writing and support restore from backup.

## Not Covered

- full sandbox isolation
- kernel-level protection
- all prompt injection cases
- enterprise compliance
- protection when the host machine is already compromised
- automatic modification of every MCP client configuration
- safe execution of arbitrary MCP servers during deep scan beyond the limited `initialize` and `tools/list` probe
- Web Dashboard, cloud policy center, RBAC, or SSO

## Working Assumption

MCP ToolLatch starts as a local policy and visibility layer. It should make unsafe behavior easier to see and interrupt, but it should not be presented as a complete containment system.
