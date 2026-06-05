import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("phase 2 documentation safeguards", () => {
  it("documents MCP Inspector validation with an explicit Node version prerequisite", async () => {
    const guide = await readRepoFile("docs", "integration", "mcp-inspector.md");

    expect(guide).toContain("Node `>=22.7.5`");
    expect(guide).toContain("npx @modelcontextprotocol/inspector");
    expect(guide).toContain("tests/fixtures/fake-mcp-server.js");
    expect(guide).toContain("stdout contains only JSON-RPC messages");
  });

  it("keeps the phase 2 demo scoped to temporary fixtures instead of real secrets", async () => {
    const demo = await readRepoFile("docs", "demo", "phase-2-demo.md");

    expect(demo).toContain("tmp/phase2-demo/");
    expect(demo).toContain("does not touch real Cursor, Claude Desktop, VS Code, `.env`, SSH, or certificate files");
    expect(demo).toContain("read_file ./src/ok.txt");
    expect(demo).not.toContain("cat ~/.ssh");
    expect(demo).not.toContain("cat .env");
  });

  it("ignores temporary Node toolchains and validation artifacts", async () => {
    const gitignore = await readRepoFile(".gitignore");

    expect(gitignore).toContain("tmp/");
    expect(gitignore).toContain(".tools/");
  });
});

async function readRepoFile(...parts: string[]): Promise<string> {
  return fs.readFile(path.join(repoRoot, ...parts), "utf8");
}
