import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultPolicyYaml } from "@mcp-toollatch/policy";
import { runDoctor, summarizeDoctorReport } from "./index";

describe("doctor diagnostics", () => {
  it("reports a missing policy with a user-facing suggestion", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "toollatch-doctor-missing-"));

    const report = await runDoctor({ cwd: tmp, clients: ["cursor"] });

    expect(report.issues.map((issue) => issue.id)).toContain("POLICY_MISSING");
    expect(summarizeDoctorReport(report)).toContain("toollatch init --profile");
  });

  it("finds high-risk servers from scanner output", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "toollatch-doctor-risk-"));
    await fs.writeFile(path.join(tmp, "toollatch.policy.yaml"), createDefaultPolicyYaml(), "utf8");
    await fs.mkdir(path.join(tmp, ".cursor"), { recursive: true });
    const config = path.join(tmp, ".cursor", "mcp.json");
    await fs.writeFile(
      config,
      JSON.stringify({ mcpServers: { shell: { command: "bash", args: ["-lc", "echo hi"] } } }),
      "utf8",
    );

    const report = await runDoctor({
      cwd: tmp,
      clients: ["cursor"],
      homeDir: tmp,
      deep: false,
    });

    expect(report.serversFound).toBe(1);
    expect(report.issues.map((issue) => issue.id)).toContain("HIGH_RISK_SERVER");
  });
});
