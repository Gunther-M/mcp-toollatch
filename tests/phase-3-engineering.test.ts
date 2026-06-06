import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("phase 3 engineering gates", () => {
  it("defines GitHub Actions quality and pack smoke checks", async () => {
    const workflow = await readRepoFile(".github", "workflows", "ci.yml");

    for (const command of [
      "pnpm install --frozen-lockfile",
      "pnpm typecheck",
      "pnpm test",
      "pnpm build",
      "pnpm lint",
      "pnpm --dir packages/cli pack",
      "npx toollatch --version",
      "npx toollatch scan --json",
    ]) {
      expect(workflow).toContain(command);
    }
    expect(workflow).toContain("windows-latest");
    expect(workflow).toContain("ubuntu-latest");
    expect(workflow).toContain("Sensitive file guard");
  });

  it("keeps package dependency direction acyclic and within module boundaries", async () => {
    const packageDirs = await fs.readdir(path.join(repoRoot, "packages"));
    const packages = await Promise.all(
      packageDirs.map(async (dir) => {
        const manifest = JSON.parse(await readRepoFile("packages", dir, "package.json")) as {
          name: string;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        return { dir, manifest };
      }),
    );
    const rankByName = new Map<string, number>([
      ["@mcp-toollatch/core", 0],
      ["@mcp-toollatch/rules", 1],
      ["@mcp-toollatch/audit", 1],
      ["@mcp-toollatch/policy", 2],
      ["@mcp-toollatch/scanner", 2],
      ["@mcp-toollatch/proxy", 3],
      ["@mcp-toollatch/config", 4],
      ["@mcp-toollatch/doctor", 4],
      ["@mcp-toollatch/cli", 5],
    ]);

    for (const { manifest } of packages) {
      const ownRank = rankByName.get(manifest.name);
      if (ownRank === undefined) {
        throw new Error(`Missing rank for ${manifest.name}`);
      }
      const deps = { ...manifest.dependencies, ...manifest.devDependencies };
      for (const depName of Object.keys(deps).filter((name) => name.startsWith("@mcp-toollatch/"))) {
        const depRank = rankByName.get(depName);
        if (depRank === undefined) {
          throw new Error(`Missing rank for dependency ${depName}`);
        }
        expect(depRank, `${manifest.name} must not depend upward on ${depName}`).toBeLessThanOrEqual(ownRank);
      }
    }
  });

  it("documents phase 3 policy, audit, and smoke commands", async () => {
    const readme = await readRepoFile("README.md");
    const policyReference = await readRepoFile("docs", "policy-reference.md");

    for (const command of [
      "toollatch scan --deep --json",
      "toollatch doctor --json",
      "toollatch rules list --json",
      "toollatch config paths --json",
    ]) {
      expect(readme).toContain(command);
    }
    for (const field of ["allow_domains", "deny_domains", "allow_commands", "rotation", "RULE-NET-001"]) {
      expect(policyReference).toContain(field);
    }
  });
});

async function readRepoFile(...parts: string[]): Promise<string> {
  return fs.readFile(path.join(repoRoot, ...parts), "utf8");
}
