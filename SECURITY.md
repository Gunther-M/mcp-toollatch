# Security Policy

MCP ToolLatch is pre-alpha and not production-ready.

## Reporting Security Issues

Please do not open a public issue for vulnerabilities or sensitive findings. Use the repository owner's preferred private reporting channel on Gitee, or contact the maintainers privately before sharing details.

## Current Scope

The first phase focuses on visibility and local control for MCP tool calls:

- MCP client configuration scanning
- local policy file initialization
- stdio MCP proxy design
- risky tool call blocking or approval
- audit log visibility

## Out of Scope for the First Phase

- full sandbox isolation
- kernel-level protection
- complete prompt-injection defense
- enterprise compliance guarantees
- protection against compromised hosts

## Secret Handling

Do not commit `.env` files, tokens, SSH private keys, certificates, or private local MCP configuration that exposes sensitive paths or credentials.
