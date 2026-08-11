import { afterEach, describe, expect, it } from "vitest";
import { buildOmniRouteMcpServerRef, ProviderRegistry } from "./registry.js";

// Vitest pools workers across files, so a leaked process.env value outlives this
// file and changes what buildJaitMcpServerRefs() returns for unrelated suites.
// Restore the originals after every test rather than deleting blindly.
const ENV_KEYS = ["JAIT_OMNIROUTE_MCP", "OMNIROUTE_API_KEY", "OMNIROUTE_BASE_URL"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

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

  it("omits the OmniRoute MCP server unless it is explicitly switched on", () => {
    delete process.env.JAIT_OMNIROUTE_MCP;
    const refs = new ProviderRegistry().buildJaitMcpServerRefs({ host: "127.0.0.1", port: 8000 });
    expect(refs.map((ref) => ref.name)).toEqual(["jait_core", "jait"]);
  });

  it("appends the OmniRoute MCP server when switched on", () => {
    process.env.JAIT_OMNIROUTE_MCP = "1";
    process.env.OMNIROUTE_API_KEY = "sk-omni";
    const refs = new ProviderRegistry().buildJaitMcpServerRefs({ host: "127.0.0.1", port: 8000 });
    expect(refs.map((ref) => ref.name)).toEqual(["jait_core", "jait", "omniroute"]);
  });
});

describe("buildOmniRouteMcpServerRef", () => {
  it("returns null when the switch is absent or not exactly 1", () => {
    expect(buildOmniRouteMcpServerRef({ OMNIROUTE_API_KEY: "sk-omni" })).toBeNull();
    expect(buildOmniRouteMcpServerRef({ JAIT_OMNIROUTE_MCP: "0", OMNIROUTE_API_KEY: "sk-omni" })).toBeNull();
    expect(buildOmniRouteMcpServerRef({ JAIT_OMNIROUTE_MCP: "true", OMNIROUTE_API_KEY: "sk-omni" })).toBeNull();
  });

  it("returns null without a key, since the MCP endpoint always 401s unauthenticated", () => {
    // The inference API serves keyless free-tier providers; the MCP endpoint
    // does not. Handing an agent a ref that can only fail is worse than none.
    expect(buildOmniRouteMcpServerRef({ JAIT_OMNIROUTE_MCP: "1" })).toBeNull();
  });

  it("hangs the MCP endpoint off the router root, not the /v1 API surface", () => {
    // OMNIROUTE_BASE_URL names the OpenAI-compatible surface; the MCP stream
    // lives one level up. Naively appending would give /v1/api/mcp/stream.
    const ref = buildOmniRouteMcpServerRef({
      JAIT_OMNIROUTE_MCP: "1",
      OMNIROUTE_BASE_URL: "http://nas:20128/v1/",
      OMNIROUTE_API_KEY: "sk-omni",
    });

    expect(ref).toEqual({
      name: "omniroute",
      transport: "http",
      url: "http://nas:20128/api/mcp/stream",
      headers: { Authorization: "Bearer sk-omni" },
    });
  });

  it("authenticates via header, not env, because env is meaningless over HTTP", () => {
    const ref = buildOmniRouteMcpServerRef({
      JAIT_OMNIROUTE_MCP: "1",
      OMNIROUTE_API_KEY: "sk-omni",
    });

    expect(ref?.url).toBe("http://localhost:20128/api/mcp/stream");
    expect(ref?.headers).toEqual({ Authorization: "Bearer sk-omni" });
    expect(ref?.env).toBeUndefined();
  });
});
