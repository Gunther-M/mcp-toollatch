export const scannerModule = {
  name: "scanner",
  purpose: "Discover MCP client configuration and surface risk signals.",
} as const;

export type ScannerModule = typeof scannerModule;
