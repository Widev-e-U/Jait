import { describe, expect, it } from "vitest";
import { mergeJaitCodexConfig } from "./jait-mcp.js";

describe("mergeJaitCodexConfig", () => {
  it("adds the core namespace without replacing existing Codex settings", () => {
    const merged = JSON.parse(mergeJaitCodexConfig(JSON.stringify({
      model: "gpt-5.6-sol",
      features: {
        apps: true,
        code_mode: {
          enabled: true,
          direct_only_tool_namespaces: ["mcp__history"],
        },
      },
    })));

    expect(merged).toEqual({
      model: "gpt-5.6-sol",
      features: {
        apps: true,
        code_mode: {
          enabled: true,
          direct_only_tool_namespaces: ["mcp__history", "mcp__jait_core"],
        },
      },
    });
  });
});
