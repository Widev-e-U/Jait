import { describe, expect, it } from "vitest";
import { ProviderRegistry } from "./registry.js";

describe("ProviderRegistry", () => {
  it("splits Jait core and deferred tools into distinct MCP server refs", () => {
    const refs = new ProviderRegistry().buildJaitMcpServerRefs(
      { host: "127.0.0.1", port: 8000 },
      "https://gateway.example.test",
      { sessionId: "session-1", projectRoot: "/workspace/project" },
    );

    expect(refs.map((ref) => ref.name)).toEqual(["jait_core", "jait"]);
    expect(refs.map((ref) => {
      const url = new URL(ref.url!);
      return {
        origin: url.origin,
        pathname: url.pathname,
        sessionId: url.searchParams.get("sessionId"),
        projectRoot: url.searchParams.get("projectRoot"),
        toolSet: url.searchParams.get("toolSet"),
      };
    })).toEqual([
      { origin: "https://gateway.example.test", pathname: "/mcp", sessionId: "session-1", projectRoot: "/workspace/project", toolSet: "core" },
      { origin: "https://gateway.example.test", pathname: "/mcp", sessionId: "session-1", projectRoot: "/workspace/project", toolSet: "deferred" },
    ]);
  });
});
