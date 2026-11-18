import { describe, expect, it } from "vitest";
import { providerMcpBinding } from "../../../../tests/contract/fixtures/provider-mcp-binding.js";

describe("Codex ACP chat-scoped MCP configuration", () => {
  it("overrides saved server names for each personal chat and account alias", async () => {
    const results = await providerMcpBinding();
    for (const [index, result] of results.entries()) {
      expect(result.filtering).toBe("true");
      for (const name of ["jait_core", "jait"]) {
        const url = new URL(result.servers.find((server: {name: string}) => server.name === name).url);
        expect(url.searchParams.get("sessionId")).toBe(index === 0 ? "personal-chat-a" : "personal-chat-b");
        expect(url.searchParams.has("projectRoot")).toBe(false);
        expect(url.searchParams.get("toolSet")).toBe(name === "jait_core" ? "core" : "deferred");
      }
    }
  });

  it("preserves other adapters' configuration", async () => {
    const results = await providerMcpBinding("claude-code");
    expect(results.map(result => result.filtering)).toEqual(["false", "false"]);
  });
});
