# Security Policy

MCP ToolLatch `v0.3.0-beta.1` is a beta local policy, approval, and audit gateway for MCP tool calls. It is not a production-grade sandbox.

## Reporting Security Issues

Please do not open a detailed public issue for vulnerabilities or sensitive findings.

Use the repository owner's preferred private reporting channel on Gitee/GitHub, or contact the maintainers privately before sharing details. If private security advisories are available on the hosting platform, prefer that route.

Open public issues only for sanitized minimal reproductions. Do not include real credentials, private infrastructure details, exploit chains, or raw sensitive logs.

During the beta phase, response times are best effort. Security-sensitive reports will be prioritized over general feature requests, but this project does not offer an enterprise SLA.

## Current Scope

The current beta focuses on visibility and local control for MCP tool calls:

- MCP client configuration scanning
- local policy file initialization
- stdio MCP proxy design
- risky tool call blocking or approval
- audit log visibility
- client config dry-run/apply/restore helpers
- local diagnostic and validation commands

## Out of Scope

- full sandbox isolation
- kernel-level protection
- complete prompt-injection defense
- enterprise compliance guarantees
- protection against compromised hosts
- RBAC, cloud policy management, or a web dashboard

## Secret Handling

Do not commit or publicly paste:

- `.env` files or `.env` contents
- tokens, API keys, passwords, cookies, or authorization headers
- SSH private keys
- certificates or private key material
- private local MCP configuration that exposes sensitive paths or credentials
- raw audit logs before redaction

When reporting a security issue, prefer fake MCP servers, temporary directories, and sanitized config snippets.
