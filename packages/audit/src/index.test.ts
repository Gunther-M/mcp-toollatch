import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAuditEvent, exportAuditEvents, readAuditEvents, recordAuditEvent } from "./index";

describe("audit JSONL", () => {
  it("creates redacted audit events", () => {
    const event = createAuditEvent({
      request: { serverName: "fs", toolName: "read_file", arguments: { token: "secret-token" } },
      decision: { action: "block", risk: "critical", reason: "blocked", matchedRuleId: "RULE-001" },
    });
    expect(JSON.stringify(event)).not.toContain("secret-token");
  });

  it("writes and reads audit events", async () => {
    const file = await tempLogPath();
    await recordAuditEvent(file, {
      request: { serverName: "fs", toolName: "read_file", arguments: { path: ".env" } },
      decision: { action: "block", risk: "critical", reason: "blocked", matchedRuleId: "RULE-001" },
    });
    const events = await readAuditEvents(file);
    expect(events).toHaveLength(1);
    expect(events[0]?.decision).toBe("block");
  });

  it("filters by decision", async () => {
    const file = await tempLogPath();
    await recordAuditEvent(file, {
      request: { serverName: "fs", toolName: "read_file", arguments: {} },
      decision: { action: "allow", risk: "low", reason: "ok" },
    });
    await recordAuditEvent(file, {
      request: { serverName: "fs", toolName: "read_file", arguments: {} },
      decision: { action: "block", risk: "high", reason: "no" },
    });
    expect(await readAuditEvents(file, { decision: "block" })).toHaveLength(1);
  });

  it("respects limit and returns newest first", async () => {
    const file = await tempLogPath();
    for (const index of [1, 2, 3]) {
      await recordAuditEvent(file, {
        request: { serverName: "s", toolName: `t${index}`, arguments: {} },
        decision: { action: "allow", risk: "low", reason: "ok" },
      });
    }
    const events = await readAuditEvents(file, { limit: 2 });
    expect(events.map((event) => event.tool)).toEqual(["t3", "t2"]);
  });

  it("ignores corrupted JSONL lines", async () => {
    const file = await tempLogPath();
    await fs.writeFile(file, "not-json\n", "utf8");
    expect(await readAuditEvents(file)).toEqual([]);
  });

  it("reads a valid first JSONL line even when it starts with a UTF-8 BOM", async () => {
    const file = await tempLogPath();
    const event = createAuditEvent({
      request: { serverName: "fs", toolName: "read_file", arguments: { path: "README.md" } },
      decision: { action: "allow", risk: "low", reason: "ok" },
    });
    await fs.writeFile(file, `\uFEFF${JSON.stringify(event)}\nnot-json\n`, "utf8");

    const events = await readAuditEvents(file);

    expect(events).toHaveLength(1);
    expect(events[0]?.tool).toBe("read_file");
  });

  it("exports filtered events without leaking sensitive values", async () => {
    const file = await tempLogPath();
    const outFile = path.join(path.dirname(file), "audit.csv");
    await recordAuditEvent(file, {
      request: {
        serverName: "fs",
        toolName: "read_file",
        arguments: { token: "secret-token-value", path: ".env" },
      },
      decision: { action: "block", risk: "critical", reason: "blocked", matchedRuleId: "RULE-001" },
    });

    const result = await exportAuditEvents({
      logFilePath: file,
      outFilePath: outFile,
      format: "csv",
      query: { decision: "block" },
    });

    const exported = await fs.readFile(outFile, "utf8");
    expect(result.count).toBe(1);
    expect(exported).toContain("RULE-001");
    expect(exported).not.toContain("secret-token-value");
  });
});

async function tempLogPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "toollatch-audit-"));
  return path.join(dir, "audit.jsonl");
}
