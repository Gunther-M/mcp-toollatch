# Threat Model

This document describes the first-phase risk model for MCP ToolLatch.

## Risks in Scope

- sensitive file access
- dangerous shell commands
- overly broad filesystem access
- suspicious tool descriptions
- audit visibility gaps

## First-Phase Controls

- Scan MCP configuration for obvious risk indicators.
- Generate local policy files that describe intended decisions.
- Wrap stdio MCP servers so tool calls can be inspected before execution.
- Record audit events for decisions, prompts, and blocked calls.

## Not Covered

- full sandbox isolation
- kernel-level protection
- all prompt injection cases
- enterprise compliance
- protection when the host machine is already compromised

## Working Assumption

MCP ToolLatch starts as a local policy and visibility layer. It should make unsafe behavior easier to see and interrupt, but it should not be presented as a complete containment system.
