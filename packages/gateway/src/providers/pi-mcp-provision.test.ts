import { existsSync, readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
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


const reproRoot = resolve(import.meta.dirname, "../../../../.jait/artifacts/gateway-rust/pi-provision-repro");
function restoreTmpdir(previous: string | undefined) {
  if (previous === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previous;
}
describe("pi provisioning regressions", () => {
  it.skipIf(process.platform === "win32")("preserves literal shell characters in command and config paths", () => {
    mkdirSync(reproRoot, { recursive: true });
    const fixture = mkdtempSync(join(reproRoot, 'paths "$JAIT_PI_MARKER"-'));
    const realPi = join(fixture, 'pi "$JAIT_PI_MARKER"');
    writeFileSync(realPi, "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)));\n", { mode: 0o755 });
    const previous = process.env.TMPDIR;
    process.env.TMPDIR = fixture;
    const provision = provisionPiMcp("pi", httpRefs, { sessionId: "literal", realPiCommand: realPi })!;
    try {
      const args = ["literal $arg", "two words", "; &"];
      const child = spawnSync(provision.env.PI_ACP_PI_COMMAND!, args, { encoding: "utf8", env: { ...process.env, JAIT_PI_MARKER: "expanded" } });
      expect(child.status, child.stderr).toBe(0);
      expect(JSON.parse(child.stdout)).toEqual(["--mcp-config", join(dirname(provision.env.PI_ACP_PI_COMMAND!), "mcp.json"), ...args]);
    } finally {
      provision.cleanup(); restoreTmpdir(previous); rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("returns null when the provisioning root cannot contain a directory", () => {
    mkdirSync(reproRoot, { recursive: true });
    const fixture = mkdtempSync(join(reproRoot, "root-error-"));
    const blocked = join(fixture, "not-a-directory");
    writeFileSync(blocked, "fixture");
    const previous = process.env.TMPDIR; process.env.TMPDIR = blocked;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      let result: ReturnType<typeof provisionPiMcp> | undefined;
      expect(() => { result = provisionPiMcp("pi", httpRefs, { sessionId: "root-error" }); }).not.toThrow();
      expect(result).toBeNull(); expect(warning).toHaveBeenCalledTimes(1);
    } finally { restoreTmpdir(previous); warning.mockRestore(); rmSync(fixture, { recursive: true, force: true }); }
  });

  it("retains a server literally named __proto__", () => {
    const refs: McpServerRef[] = [{ name: "__proto__", transport: "http", url: "http://example.test/mcp" }];
    const provision = provisionPiMcp("pi", refs, { sessionId: "prototype" })!;
    try {
      const config = JSON.parse(readFileSync(join(dirname(provision.env.PI_ACP_PI_COMMAND!), "mcp.json"), "utf8"));
      expect(Object.hasOwn(config.mcpServers, "__proto__")).toBe(true);
      expect(config.mcpServers.__proto__).toEqual({ url: "http://example.test/mcp", lifecycle: "lazy" });
    } finally { provision.cleanup(); }
  });

  it("refuses a session id that could escape the provisioning directory", () => {
    // Session ids become directory names; a path separator must never let a
    // provisioned config land outside the temp root. Provisioning is
    // best-effort, so the session starts without Jait tools instead of failing.
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(provisionPiMcp("pi", httpRefs, { sessionId: "../escape" })).toBeNull();
      expect(warning).toHaveBeenCalledTimes(1);
      expect(String(warning.mock.calls[0]?.[0])).toContain("pi MCP provisioning failed");
    } finally { warning.mockRestore(); }
  });
});


describe("minimal stdio provisioning", () => {
  it("defaults omitted arguments and environment without changing the server command", () => {
    mkdirSync(reproRoot, { recursive: true });
    const previous = process.env.TMPDIR;
    process.env.TMPDIR = reproRoot;
    const provision = provisionPiMcp("pi", [{ name: "minimal", transport: "stdio", command: "node" }],
      { sessionId: "minimal-stdio", realPiCommand: "  " })!;
    expect(provision).not.toBeNull();
    try {
      const wrapper = provision.env.PI_ACP_PI_COMMAND!;
      const config = JSON.parse(readFileSync(join(dirname(wrapper), "mcp.json"), "utf8"));
      expect(config.mcpServers.minimal).toEqual({ command: "node", args: [] });
      expect(config.mcpServers.minimal).not.toHaveProperty("env");
      expect(readFileSync(wrapper, "utf8")).toContain('"pi" --mcp-config');
    } finally { provision.cleanup(); restoreTmpdir(previous); }
  });
});
