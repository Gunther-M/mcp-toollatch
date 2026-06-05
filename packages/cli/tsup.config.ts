import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2022",
  dts: true,
  clean: true,
  noExternal: [
    "@mcp-toollatch/audit",
    "@mcp-toollatch/config",
    "@mcp-toollatch/core",
    "@mcp-toollatch/doctor",
    "@mcp-toollatch/policy",
    "@mcp-toollatch/proxy",
    "@mcp-toollatch/rules",
    "@mcp-toollatch/scanner",
  ],
});
