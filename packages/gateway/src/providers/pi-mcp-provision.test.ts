import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { isPiBasedProvider, provisionPiMcp } from "./pi-mcp-provision.js";
import { JAIT_CORE_MCP_SERVER_NAME, JAIT_DEFERRED_MCP_SERVER_NAME } from "./jait-mcp.js";
import type { McpServerRef } from "./contracts.js";

const httpRefs: McpServerRef[] = [
  { name: JAIT_CORE_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=core" },
  { name: JAIT_DEFERRED_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=deferred" },
];

describe("pi-mcp-provision", () => {
  it("returns null for non-pi providers", () => {
    expect(provisionPiMcp("codex", httpRefs, { sessionId: "s1" })).toBeNull();
    expect(provisionPiMcp("claude-code", httpRefs, { sessionId: "s1" })).toBeNull();
    expect(provisionPiMcp("cursor", httpRefs, { sessionId: "s1" })).toBeNull();
  });

  it("returns null when there are no MCP servers", () => {
    expect(provisionPiMcp("pi", undefined, { sessionId: "s1" })).toBeNull();
    expect(provisionPiMcp("pi", [], { sessionId: "s1" })).toBeNull();
  });

  it("recognizes pi and pi-gemini as pi-based", () => {
    expect(isPiBasedProvider("pi")).toBe(true);
    expect(isPiBasedProvider("pi-gemini")).toBe(true);
    expect(isPiBasedProvider("codex")).toBe(false);
  });

  it("writes a per-session config with the Jait MCP servers and a wrapper", () => {
    const result = provisionPiMcp("pi", httpRefs, { sessionId: "s1", realPiCommand: "/usr/local/bin/pi" });
    expect(result).not.toBeNull();
    const provision = result!;
    try {
      const wrapperPath = provision.env["PI_ACP_PI_COMMAND"];
      expect(wrapperPath).toBeTruthy();
      expect(join(wrapperPath)).toContain("jait-pi-mcp-s1-");
      expect(existsSync(wrapperPath)).toBe(true);

      const configPath = join(dirname(wrapperPath), "mcp.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      expect(config.mcpServers[JAIT_CORE_MCP_SERVER_NAME]).toEqual({
        url: httpRefs[0].url,
        lifecycle: "lazy",
      });
      expect(config.mcpServers[JAIT_DEFERRED_MCP_SERVER_NAME]).toEqual({
        url: httpRefs[1].url,
        lifecycle: "lazy",
      });

      const wrapper = readFileSync(wrapperPath, "utf8");
      expect(wrapper).toContain(`exec "/usr/local/bin/pi" --mcp-config "${configPath}"`);
      expect(wrapper).toContain('"$@"');
    } finally {
      provision.cleanup();
    }
  });

  it("defaults the real pi command to 'pi' when not provided", () => {
    const provision = provisionPiMcp("pi-gemini", httpRefs, { sessionId: "s2" })!;
    try {
      const wrapper = readFileSync(provision.env["PI_ACP_PI_COMMAND"], "utf8");
      expect(wrapper).toContain('exec "pi" --mcp-config');
    } finally {
      provision.cleanup();
    }
  });

  it("handles stdio refs with command/args/env", () => {
    const stdioRefs: McpServerRef[] = [
      { name: "local", transport: "stdio", command: "node", args: ["server.js"], env: { FOO: "bar" } },
    ];
    const provision = provisionPiMcp("pi", stdioRefs, { sessionId: "s3" })!;
    try {
      const config = JSON.parse(readFileSync(join(dirname(provision.env["PI_ACP_PI_COMMAND"]), "mcp.json"), "utf8"));
      expect(config.mcpServers["local"]).toEqual({ command: "node", args: ["server.js"], env: { FOO: "bar" } });
    } finally {
      provision.cleanup();
    }
  });

  it("cleanup removes the per-session directory", () => {
    const provision = provisionPiMcp("pi", httpRefs, { sessionId: "s4" })!;
    const wrapperPath = provision.env["PI_ACP_PI_COMMAND"];
    const dir = dirname(wrapperPath);
    expect(existsSync(dir)).toBe(true);
    provision.cleanup();
    expect(existsSync(dir)).toBe(false);
    // idempotent
    provision.cleanup();
  });
});
