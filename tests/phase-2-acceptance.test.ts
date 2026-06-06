import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { recordAuditEvent } from "@mcp-toollatch/audit";
import { createDefaultPolicyYaml } from "@mcp-toollatch/policy";

const repoRoot = process.cwd();
const cliEntry = path.join(repoRoot, "packages", "cli", "dist", "index.js");
const fakeServer = path.join(repoRoot, "tests", "fixtures", "fake-mcp-server.js");

describe("phase 2 acceptance: CLI deep scan, apply, doctor, and logs export", () => {
  it("deep scans a fixture MCP server through the built CLI", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "toollatch-phase2-scan-"));
    const config = path.join(tmp, "cursor.json");
    await fs.writeFile(
      config,
      JSON.stringify({
        mcpServers: {
          fake: { command: process.execPath, args: [fakeServer], cwd: tmp },
        },
      }),
      "utf8",
    );

    const result = await runCli([
      "scan",
      "--client",
      "cursor",
      "--config",
      config,
      "--deep",
      "--timeout",
      "5000",
      "--json",
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.servers[0].deepScan.status).toBe("ok");
    expect(report.servers[0].tools.map((tool: { name: string }) => tool.name)).toContain("read_file");
    expect(result.stdout).not.toContain("fake-mcp-server ready");
  });

  it("applies a wrapped config only with --write and restores from backup", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "toollatch-phase2-apply-"));
    const config = path.join(tmp, "mcp.json");
    const original = JSON.stringify(
      {
        mcpServers: {
          fs: {
            command: "node",
            args: ["server.js"],
            env: { apiKey: "should-not-leak-from-apply-json" },
          },
        },
      },
      null,
      2,
    );
    await fs.writeFile(config, original, "utf8");

    const dryRun = await runCli(["apply", "--client", "cursor", "--server", "fs", "--config", config, "--json"]);
    expect(JSON.parse(dryRun.stdout).changed).toBe(true);
    expect(dryRun.stdout).not.toContain("should-not-leak-from-apply-json");
    expect(dryRun.stdout).not.toContain("originalConfig");
    expect(dryRun.stdout).not.toContain("updatedConfig");
    expect(await fs.readFile(config, "utf8")).toBe(original);

    const applied = await runCli([
      "apply",
      "--client",
      "cursor",
      "--server",
      "fs",
      "--config",
      config,
      "--write",
      "--json",
    ]);
    const appliedJson = JSON.parse(applied.stdout);
    expect(appliedJson.backupPath).toBeDefined();
    expect(await fs.readFile(config, "utf8")).toContain("toollatch");

    await runCli(["restore", "--config", config, "--backup", appliedJson.backupPath, "--json"]);
    expect(await fs.readFile(config, "utf8")).toBe(original);
  });

  it("prints doctor JSON and exports redacted audit logs", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "toollatch-phase2-doctor-"));
    const policyPath = path.join(tmp, "toollatch.policy.yaml");
    const auditPath = path.join(tmp, "audit", "audit.jsonl");
    const exportPath = path.join(tmp, "export.csv");
    await fs.writeFile(policyPath, createDefaultPolicyYaml(), "utf8");
    await recordAuditEvent(auditPath, {
      request: {
        serverName: "fake",
        toolName: "read_file",
        arguments: { token: "secret-token-value", path: ".env" },
      },
      decision: { action: "block", risk: "critical", reason: "blocked", matchedRuleId: "RULE-PATH-001" },
    });

    const doctor = await runCli(["doctor", "--policy", policyPath, "--audit-log", auditPath, "--json"]);
    expect(JSON.parse(doctor.stdout).auditEventsFound).toBe(1);

    const exported = await runCli([
      "logs",
      "export",
      "--log-file",
      auditPath,
      "--out",
      exportPath,
      "--format",
      "csv",
      "--decision",
      "block",
      "--json",
    ]);
    expect(JSON.parse(exported.stdout).count).toBe(1);
    const csv = await fs.readFile(exportPath, "utf8");
    expect(csv).toContain("RULE-PATH-001");
    expect(csv).not.toContain("secret-token-value");
  });
});

async function runCli(args: string[]): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [cliEntry, ...args], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`CLI timed out: ${args.join(" ")}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 15_000);
    child.once("error", reject);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });

  if (exitCode !== 0) {
    throw new Error(`CLI failed (${exitCode}): ${args.join(" ")}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }

  return { exitCode, stdout, stderr };
}
