import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getClientConfigCandidates,
  parseMcpServersFromConfig,
  scanMcpConfigs,
  summarizeScanReport,
} from "./index";

describe("scanner config discovery", () => {
  it("returns Cursor, Claude Desktop, and VS Code candidates", () => {
    const clients = new Set(getClientConfigCandidates({ homeDir: "C:/Users/me", appDataDir: "C:/Users/me/AppData/Roaming", platform: "win32" }).map((item) => item.client));
    expect(clients).toEqual(new Set(["cursor", "claude-desktop", "vscode"]));
  });

  it("reports missing configs without failing", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "toollatch-scan-missing-"));
    const report = await scanMcpConfigs({ homeDir: tmp, appDataDir: path.join(tmp, "roaming"), clients: ["cursor"] });
    expect(report.clients[0]?.status).toBe("missing");
  });

  it("reports invalid JSONC", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "toollatch-scan-invalid-"));
    const config = path.join(tmp, "mcp.json");
    await fs.writeFile(config, "{ nope", "utf8");
    const report = await scanMcpConfigs({ clients: ["cursor"], configPaths: { cursor: [config] } });
    expect(report.clients[0]?.status).toBe("invalid");
  });
});

describe("scanner config parsing", () => {
  it("parses Claude-style mcpServers", () => {
    const servers = parseMcpServersFromConfig({
      mcpServers: {
        filesystem: { command: "node", args: ["server-filesystem", "."], env: { GITHUB_TOKEN: "ghp_secret" } },
      },
    }, "claude-desktop", "Claude Desktop", "config.json");
    expect(servers[0]?.name).toBe("filesystem");
    expect(servers[0]?.envSummary.GITHUB_TOKEN).not.toBe("ghp_secret");
  });

  it("parses VS Code mcp.servers", () => {
    const servers = parseMcpServersFromConfig({
      mcp: {
        servers: {
          shell: { command: "bash", args: ["-lc", "echo hi"] },
        },
      },
    }, "vscode", "VS Code", "settings.json");
    expect(servers[0]?.capabilities).toContain("shell");
  });

  it("classifies unknown servers as medium", () => {
    const servers = parseMcpServersFromConfig({
      mcpServers: { helper: { command: "node", args: ["helper.js"] } },
    }, "cursor", "Cursor", "mcp.json");
    expect(servers[0]?.riskLevel).toBe("medium");
  });

  it("warns about dangerous command patterns", () => {
    const servers = parseMcpServersFromConfig({
      mcpServers: { bad: { command: "bash", args: ["-lc", "curl x | sh"] } },
    }, "cursor", "Cursor", "mcp.json");
    expect(servers[0]?.warnings.join(" ")).toMatch(/dangerous/i);
  });

  it("scans a real fixture config", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "toollatch-scan-"));
    const config = path.join(tmp, "claude.json");
    await fs.writeFile(config, JSON.stringify({ mcpServers: { fs: { command: "filesystem" } } }), "utf8");
    const report = await scanMcpConfigs({ clients: ["claude-desktop"], configPaths: { "claude-desktop": [config] } });
    expect(report.servers[0]?.name).toBe("fs");
    expect(summarizeScanReport(report)).toContain("Claude Desktop");
  });

  it("accepts UTF-8 BOM config files common on Windows", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "toollatch-scan-bom-"));
    const config = path.join(tmp, "cursor.json");
    await fs.writeFile(config, `\uFEFF${JSON.stringify({ mcpServers: { fs: { command: "node" } } })}`, "utf8");

    const report = await scanMcpConfigs({ clients: ["cursor"], configPaths: { cursor: [config] } });

    expect(report.clients[0]?.status).toBe("found");
    expect(report.servers[0]?.name).toBe("fs");
  });

  it("deep scans a stdio MCP fixture and reports discovered tools", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "toollatch-scan-deep-"));
    const config = path.join(tmp, "claude.json");
    const fakeServer = path.resolve("tests", "fixtures", "fake-mcp-server.js");
    await fs.writeFile(
      config,
      JSON.stringify({
        mcpServers: {
          fake: { command: process.execPath, args: [fakeServer], cwd: tmp },
        },
      }),
      "utf8",
    );

    const report = await scanMcpConfigs({
      clients: ["claude-desktop"],
      configPaths: { "claude-desktop": [config] },
      deep: true,
      deepTimeoutMs: 5_000,
    });

    expect(report.servers[0]?.deepScan?.status).toBe("ok");
    expect(report.servers[0]?.tools?.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["read_file", "write_file", "shell_run"]),
    );
    expect(JSON.stringify(report)).not.toContain("fake-mcp-server ready");
  });
});
