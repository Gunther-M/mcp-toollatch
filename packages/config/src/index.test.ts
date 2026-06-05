import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyWrappedConfig, createApplyConfigPlan, restoreConfigBackup } from "./index";

describe("client config apply planning", () => {
  it("defaults to dry-run and does not modify the config file", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "toollatch-config-dry-run-"));
    const configPath = path.join(tmp, "mcp.json");
    const original = JSON.stringify({ mcpServers: { fs: { command: "node", args: ["server.js"] } } }, null, 2);
    await fs.writeFile(configPath, original, "utf8");

    const plan = await createApplyConfigPlan({ client: "cursor", serverName: "fs", configPath });

    expect(plan.changed).toBe(true);
    expect(plan.updatedConfig).toContain("toollatch");
    expect(await fs.readFile(configPath, "utf8")).toBe(original);
  });

  it("returns a safe change summary without leaking secret arguments", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "toollatch-config-change-summary-"));
    const configPath = path.join(tmp, "mcp.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          fs: {
            command: "node",
            args: ["server.js", "--token=secret-token-value"],
            env: { apiKey: "secret-api-key-value" },
          },
        },
      }),
      "utf8",
    );

    const plan = await createApplyConfigPlan({ client: "cursor", serverName: "fs", configPath });
    const summary = JSON.stringify(plan.changes);

    expect(plan.changes.map((change) => change.path)).toEqual([
      "mcpServers.fs.command",
      "mcpServers.fs.args",
    ]);
    expect(summary).not.toContain("secret-token-value");
    expect(summary).not.toContain("secret-api-key-value");
  });

  it("writes a backup before applying and can restore it", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "toollatch-config-apply-"));
    const configPath = path.join(tmp, "mcp.json");
    const original = JSON.stringify({ mcpServers: { fs: { command: "node", args: ["server.js"] } } }, null, 2);
    await fs.writeFile(configPath, original, "utf8");

    const applied = await applyWrappedConfig({ client: "cursor", serverName: "fs", configPath, write: true });
    expect(applied.backupPath).toBeDefined();
    expect(await fs.readFile(configPath, "utf8")).toContain("toollatch");

    const restored = await restoreConfigBackup({ configPath, backupPath: String(applied.backupPath) });
    expect(restored.preRestoreBackupPath).toContain("pre-restore");
    expect(await fs.readFile(configPath, "utf8")).toBe(original);
  });

  it("is idempotent for already wrapped server configs", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "toollatch-config-idempotent-"));
    const configPath = path.join(tmp, "mcp.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          fs: {
            command: "toollatch",
            args: ["wrap", "--server", "fs", "--", "node", "server.js"],
          },
        },
      }),
      "utf8",
    );

    const plan = await createApplyConfigPlan({ client: "cursor", serverName: "fs", configPath });

    expect(plan.changed).toBe(false);
    expect(plan.alreadyWrapped).toBe(true);
  });

  it("accepts UTF-8 BOM client config files", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "toollatch-config-bom-"));
    const configPath = path.join(tmp, "mcp.json");
    await fs.writeFile(
      configPath,
      `\uFEFF${JSON.stringify({ mcpServers: { fs: { command: "node", args: ["server.js"] } } })}`,
      "utf8",
    );

    const plan = await createApplyConfigPlan({ client: "cursor", serverName: "fs", configPath });

    expect(plan.changed).toBe(true);
  });
});
