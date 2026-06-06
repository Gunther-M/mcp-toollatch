import { describe, expect, it } from "vitest";
import { normalizePathForMatch, redactObject, summarizeArguments } from "./index";

describe("core utilities", () => {
  it("redacts token-like object keys", () => {
    expect(redactObject({ GITHUB_TOKEN: "ghp_secret", nested: { password: "pw" } })).toEqual({
      GITHUB_TOKEN: "ghp***",
      nested: { password: "[REDACTED]" },
    });
  });

  it("keeps non-sensitive values in summaries", () => {
    expect(summarizeArguments({ path: "./src/index.ts" })).toContain("./src/index.ts");
  });

  it("omits raw sensitive values from summaries", () => {
    expect(summarizeArguments({ api_key: "abc123456" })).not.toContain("abc123456");
  });

  it("redacts private key blocks even under generic field names", () => {
    const summary = summarizeArguments({
      content: "-----BEGIN PRIVATE KEY-----\nsecret-private-key\n-----END PRIVATE KEY-----",
    });

    expect(summary).not.toContain("secret-private-key");
    expect(summary).toContain("[REDACTED]");
  });

  it("normalizes relative paths against a base directory", () => {
    expect(normalizePathForMatch(".env", "C:/repo", "C:/Users/me")).toContain("C:/repo/.env");
  });
});
