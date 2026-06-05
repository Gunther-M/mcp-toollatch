export const proxyModule = {
  name: "proxy",
  purpose: "Wrap stdio MCP servers and mediate tool calls.",
} as const;

export type ProxyModule = typeof proxyModule;
