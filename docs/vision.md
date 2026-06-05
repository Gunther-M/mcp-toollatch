# Vision

MCP ToolLatch aims to make MCP tool access visible, reviewable, and locally governable before an AI Agent touches high-impact tools.

The project is built around a simple principle: users should be able to see what MCP servers are configured, understand which tool calls look risky, choose a local policy, and review what happened afterward.

## Goals

- Provide local-first visibility into MCP client and server configuration.
- Add an approval and policy layer before high-risk tool calls.
- Preserve audit logs that help users understand tool-call history.
- Make the first version easy to run, inspect, and extend.

## Boundaries

MCP ToolLatch is not a full sandbox in the first phase. It does not replace operating system permissions, container isolation, endpoint security, or enterprise policy systems.

The first releases should stay focused on local MCP scanning, stdio proxying, policy decisions, and audit visibility.
