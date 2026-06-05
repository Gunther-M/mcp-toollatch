import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const sourcePath = (relativePath: string): string => fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@mcp-toollatch/audit": sourcePath("./packages/audit/src/index.ts"),
      "@mcp-toollatch/config": sourcePath("./packages/config/src/index.ts"),
      "@mcp-toollatch/core": sourcePath("./packages/core/src/index.ts"),
      "@mcp-toollatch/doctor": sourcePath("./packages/doctor/src/index.ts"),
      "@mcp-toollatch/policy": sourcePath("./packages/policy/src/index.ts"),
      "@mcp-toollatch/proxy": sourcePath("./packages/proxy/src/index.ts"),
      "@mcp-toollatch/rules": sourcePath("./packages/rules/src/index.ts"),
      "@mcp-toollatch/scanner": sourcePath("./packages/scanner/src/index.ts"),
    },
  },
});
