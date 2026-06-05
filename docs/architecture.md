# Architecture

MCP ToolLatch is a pnpm workspace with small packages that can evolve independently.

## Modules

### cli

The user-facing command-line interface. It owns command parsing, output formatting, and orchestration between packages.

### scanner

Finds MCP client configuration, parses configured MCP servers, and reports risk signals.

### policy

Defines the local policy schema and will later evaluate tool calls against user rules.

### proxy

Will wrap stdio MCP servers and mediate messages between MCP clients and servers.

### audit

Defines audit event shapes and will later write local decision logs.

### rules

Holds reusable risk rule metadata and future rule packs.

### core

Shared project metadata, types, and utilities that are not owned by a single module.

## Initial Runtime Flow

1. `toollatch scan` will ask `scanner` to discover MCP configuration.
2. `toollatch init` will ask `policy` to create a starter local policy.
3. `toollatch wrap` will ask `proxy` to launch and mediate a stdio MCP server.
4. Proxy decisions will use `policy`, `rules`, and `audit`.
