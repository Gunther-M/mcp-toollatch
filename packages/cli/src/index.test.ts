import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "./index";

describe("CLI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
});
