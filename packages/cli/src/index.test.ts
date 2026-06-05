import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "./index";

describe("CLI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("registers required commands", () => {
    const commands = createProgram().commands.map((command) => command.name());
    expect(commands).toContain("scan");
    expect(commands).toContain("init");
    expect(commands).toContain("policy");
    expect(commands).toContain("wrap");
    expect(commands).toContain("logs");
  });

  it("sets a useful CLI name", () => {
    expect(createProgram().name()).toBe("toollatch");
  });

  it("registers scan JSON, output, and client options", () => {
    const scan = createProgram().commands.find((command) => command.name() === "scan");
    expect(scan?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining(["--json", "--output", "--client"]),
    );
  });

  it("rejects invalid decision values for logs", () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const logs = createProgram().commands.find((command) => command.name() === "logs");
    expect(() => logs?.parse(["--decision", "nope"], { from: "user" })).toThrow(/allow/);
  });

  it("prints a wrapped config with a default server name", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await createProgram().parseAsync(["wrap", "--print-config", "--", "node", "server.js"], {
      from: "user",
    });

    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({
      command: "toollatch",
      args: ["wrap", "--server", "mcp-server", "--policy", "toollatch.policy.yaml", "--", "node", "server.js"],
    });
  });

  it("accepts claude as an alias for claude-desktop during apply dry-run", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const configPath = await writeTempConfig();

    await createProgram().parseAsync(
      ["apply", "--client", "claude", "--server", "fs", "--config", configPath, "--dry-run", "--json"],
      { from: "user" },
    );

    const parsed = JSON.parse(String(output.mock.calls[0]?.[0])) as { client: string; changed: boolean };
    expect(parsed.client).toBe("claude-desktop");
    expect(parsed.changed).toBe(true);
  });

  it("treats --yes as a write alias for apply", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const configPath = await writeTempConfig();

    await createProgram().parseAsync(
      ["apply", "--client", "cursor", "--server", "fs", "--config", configPath, "--yes", "--json"],
      { from: "user" },
    );

    expect(await fs.readFile(configPath, "utf8")).toContain("toollatch");
  });

  it("rejects apply --dry-run when combined with write aliases", async () => {
    const configPath = await writeTempConfig();

    await expect(
      createProgram().parseAsync(
        ["apply", "--client", "cursor", "--server", "fs", "--config", configPath, "--dry-run", "--yes"],
        { from: "user" },
      ),
    ).rejects.toThrow(/dry-run/);
  });
});

async function writeTempConfig(): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "toollatch-cli-apply-"));
  const configPath = path.join(tmp, "mcp.json");
  await fs.writeFile(
    configPath,
    JSON.stringify({ mcpServers: { fs: { command: "node", args: ["server.js"] } } }),
    "utf8",
  );
  return configPath;
}
