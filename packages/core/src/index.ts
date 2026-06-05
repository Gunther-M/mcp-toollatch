export const projectMetadata = {
  name: "MCP ToolLatch",
  packageName: "mcp-toollatch",
  tagline: "Local policy, approval, and audit for MCP tool calls.",
  status: "pre-alpha",
} as const;

export type ProjectMetadata = typeof projectMetadata;
