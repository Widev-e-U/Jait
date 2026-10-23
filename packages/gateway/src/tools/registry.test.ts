import { describe, expect, it, vi } from "vitest";
import type { AuditWriter } from "../services/audit.js";
import { SurfaceRegistry } from "../surfaces/registry.js";
import { createToolRegistry, type ToolRegistryDeps } from "./index.js";
import { ToolRegistry } from "./registry.js";

function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}

function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}

describe("ToolRegistry audit and validation behavior", () => {
  it("registers project tools and does not expose any workspace.* alias", () => {
    const registry = createToolRegistry(new SurfaceRegistry(), {
      projectService: {},
      repoService: {},
    } as any);

    expect(registry.get("project.create")?.description).toContain("Create a Jait project");
    expect(registry.get("project.assign_repository")?.description).toContain("project");
    expect(registry.get("project.transfer")?.description).toContain("SCP");
    expect(registry.get("workspace.create")).toBeUndefined();
    expect(registry.get("workspace.assign_repository")).toBeUndefined();
  });

  it("registers session.search when session search deps are provided", () => {
    const registry = createToolRegistry(new SurfaceRegistry(), {
      sessionSearchService: { search: () => [] },
    } as any);

    expect(registry.get("session.search")?.description).toContain("prior chat messages");
  });

  it("normalizes builtin tools with builtin source metadata", () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "builtin.echo",
      description: "echo text",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ ok: true, message: "ok" }),
    });

    expect(registry.get("builtin.echo")).toMatchObject({
      source: "builtin",
      sourceMetadata: { kind: "builtin" },
    });
    expect(registry.listInfo()).toContainEqual(expect.objectContaining({
      name: "builtin.echo",
      source: "builtin",
      sourceMetadata: { kind: "builtin" },
    }));
  });

  it("registers plugin tools with explicit plugin source metadata", () => {
    const registry = new ToolRegistry();
    registry.registerPluginTools(
      { id: "demo-plugin", displayName: "Demo Plugin" },
      [{
        name: "demo.echo",
        description: "echo from plugin",
        parameters: { type: "object", properties: {} },
        tier: "external",
        category: "external",
        risk: "high",
        defaultConsentLevel: "dangerous",
        execute: async () => ({ ok: true, message: "plugin" }),
      }],
    );

    expect(registry.get("demo.echo")).toMatchObject({
      source: "plugin:demo-plugin",
      sourceMetadata: {
        kind: "plugin",
        pluginId: "demo-plugin",
        pluginDisplayName: "Demo Plugin",
      },
      tier: "external",
      category: "external",
      risk: "high",
      defaultConsentLevel: "dangerous",
    });
    expect(registry.listInfo()).toContainEqual(expect.objectContaining({
      name: "demo.echo",
      source: "plugin:demo-plugin",
      sourceMetadata: {
        kind: "plugin",
        pluginId: "demo-plugin",
        pluginDisplayName: "Demo Plugin",
      },
    }));
  });

  it("returns validation errors and logs tool.validation_error", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "echo",
      description: "echo text",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
      execute: async (input: { text: string }) => ({ ok: true, message: input.text }),
    });

    const writes: unknown[] = [];
    const audit = {
      write: vi.fn((entry: unknown) => {
        writes.push(entry);
        return "audit-id";
      }),
    } as unknown as AuditWriter;

    const result = await registry.execute("echo", {}, context(), audit);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Input validation failed");
    expect((audit.write as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect(writes[0]).toMatchObject({ actionType: "tool.validation_error", status: "failed", toolName: "echo" });
  });

  it("logs execute + result on success", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "ok.tool",
      description: "returns success",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ ok: true, message: "done", data: { ok: true } }),
    });

    const writes: unknown[] = [];
    const audit = {
      write: vi.fn((entry: unknown) => {
        writes.push(entry);
        return "audit-id";
      }),
    } as unknown as AuditWriter;

    const result = await registry.execute("ok.tool", {}, context(), audit);

    expect(result.ok).toBe(true);
    expect((audit.write as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    expect(writes[0]).toMatchObject({ actionType: "tool.execute", status: "executing", toolName: "ok.tool" });
    expect(writes[1]).toMatchObject({ actionType: "tool.result", status: "completed", toolName: "ok.tool" });
  });

  it("logs tool.error when tool throws", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "boom.tool",
      description: "throws",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        throw new Error("kaboom");
      },
    });

    const writes: unknown[] = [];
    const audit = {
      write: vi.fn((entry: unknown) => {
        writes.push(entry);
        return "audit-id";
      }),
    } as unknown as AuditWriter;

    const result = await registry.execute("boom.tool", {}, context(), audit);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("kaboom");
    expect((audit.write as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    expect(writes[0]).toMatchObject({ actionType: "tool.execute", status: "executing", toolName: "boom.tool" });
    expect(writes[1]).toMatchObject({ actionType: "tool.error", status: "failed", toolName: "boom.tool" });
  });
});

describe("ToolRegistry discovery ranking", () => {
  it("retrieves natural-language capability matches without requiring every word", () => {
    const registry = new ToolRegistry();
    registerDiscoveryTool(registry, "preview.open", "Open a live preview of the web application");
    registerDiscoveryTool(registry, "browser.click", "Click an interactive browser element");
    registerDiscoveryTool(registry, "network.scan", "Scan the local network for reachable hosts");
    registerDiscoveryTool(registry, "ssh.run", "Run a command on a remote server over SSH");
    registerDiscoveryTool(registry, "memory.search", "Search remembered preferences and durable facts");

    expect(registry.search("show app")[0]?.name).toBe("preview.open");
    expect(registry.search("control browser").map((tool) => tool.name)).toContain("browser.click");
    expect(registry.search("scan my network")[0]?.name).toBe("network.scan");
    expect(registry.search("ssh machine")[0]?.name).toBe("ssh.run");
    expect(registry.search("what do you remember about my preferences")[0]?.name).toBe("memory.search");
  });

  it("supports fuzzy matching, priority boosts, limits, and disabled tools", () => {
    const registry = new ToolRegistry();
    registerDiscoveryTool(registry, "preview.open", "Open the application preview");
    registerDiscoveryTool(registry, "deploy.basic", "Deploy the current application");
    registerDiscoveryTool(registry, "deploy.preferred", "Deploy the current application safely", { priority: 50 });

    expect(registry.search("prevew")[0]?.name).toBe("preview.open");
    expect(registry.search("deploy")[0]?.name).toBe("deploy.preferred");
    expect(registry.search("deploy", { limit: 1 })).toHaveLength(1);
    expect(registry.search("deploy", { disabledTools: new Set(["deploy.preferred"]) })[0]?.name).toBe("deploy.basic");
  });

  it("keeps critical helpers and discovery tools visible to MCP clients", () => {
    const registry = new ToolRegistry();
    registerDiscoveryTool(registry, "todo", "Track multi-step work", { tier: "core" });
    registerDiscoveryTool(registry, "user.ask", "Ask the user for a decision", { tier: "core" });
    registerDiscoveryTool(registry, "tools.list", "List tools", { tier: "core" });
    registerDiscoveryTool(registry, "tools.search", "Search tools", { tier: "core" });
    registerDiscoveryTool(registry, "read", "Read project files", { tier: "core" });
    registerDiscoveryTool(registry, "preview.open", "Open a preview");
    registerDiscoveryTool(registry, "plugin.deploy", "Deploy through a plugin", { tier: "external", source: "plugin:deploy" });
    registerDiscoveryTool(registry, "mcp.github.issue", "Create a GitHub issue", { tier: "external", source: "mcp" });

    expect(registry.listForMcp().map((tool) => tool.name)).toEqual([
      "todo",
      "user.ask",
      "tools.list",
      "tools.search",
      "preview.open",
      "plugin.deploy",
    ]);
  });
});

describe("registry rebuild keeps the executing dependency set", () => {
  // The gateway builds the registry twice (early for the provider, late once the
  // scheduler exists) and reassigns the variable; the late build is the one that
  // executes tools. When the late build used a fresh literal, stage-1 dependencies
  // were dropped, so tools gated on them were advertised but unexecutable
  // (`Unknown tool: agent.github`, and agent terminals lost their App identity).
  // A single shared deps object makes that drift structurally impossible.
  it("keeps a gated stage-1 tool registered after the late rebuild merges more deps", () => {
    const deps: ToolRegistryDeps = { agentGithubAppService: {} as any };
    const early = createToolRegistry(new SurfaceRegistry(), deps);
    expect(early.listNames()).toContain("agent.github");

    Object.assign(deps, { startedAt: Date.now() } satisfies Partial<ToolRegistryDeps>);
    const late = createToolRegistry(new SurfaceRegistry(), deps);

    expect(late.listNames()).toContain("agent.github");
    // The old wiring (a late literal omitting the service) is what produced the
    // unknown-tool failure for an advertised tool.
    const drifted = createToolRegistry(new SurfaceRegistry(), { startedAt: Date.now() });
    expect(drifted.listNames()).not.toContain("agent.github");
  });
});

it("ranks a query containing constructor without reading inherited synonyms", () => {
  const registry = new ToolRegistry();
  registerDiscoveryTool(registry, "file.read", "Read constructor source files");
  expect(() => registry.rankSearch("inspect constructor source")).not.toThrow();
  expect(registry.search("constructor")[0]?.name).toBe("file.read");
});


describe("bounded tool discovery", () => {
  it("handles recovered prompts and large tool descriptions within a bounded CPU budget", () => {
    const registry = new ToolRegistry();
    const context = Array.from({ length: 8000 }, (_, index) => `context${index}`).join(" ");
    for (let index = 0; index < 300; index++) {
      registerDiscoveryTool(registry, `tool${index}.inspect`, context);
    }
    registerDiscoveryTool(registry, "network.scan", "Discover reachable network hosts");
    const started = performance.now();
    const matches = registry.search(`scan network ${context} scan network`, { limit: 10 });
    expect(matches).toHaveLength(10);
    // A generous budget catches the multi-minute freeze without relying on
    // small timing differences between CI machines.
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("keeps discovery keywords at both ends of a long prompt", () => {
    const registry = new ToolRegistry();
    registerDiscoveryTool(registry, "network.scan", "Discover network hosts");
    registerDiscoveryTool(registry, "preview.open", "Open an application preview");
    const context = Array.from({ length: 8000 }, (_, index) => `context${index}`).join(" ");
    const names = registry.search(`scan network ${context} open preview`).map(tool => tool.name);
    expect(names).toContain("network.scan");
    expect(names).toContain("preview.open");
  });

  it("does not fuzzy-match giant tokens and still finds a trailing typo", () => {
    const registry = new ToolRegistry();
    registerDiscoveryTool(registry, "preview.open", "Open the application preview");
    expect(registry.search(`${"x".repeat(500000)} prevew`)[0]?.name).toBe("preview.open");
  });

  it("does lexical ranking once and preserves limits during semantic fallback", async () => {
    const registry = new ToolRegistry();
    registerDiscoveryTool(registry, "file.read", "Read files");
    registerDiscoveryTool(registry, "file.list", "List files");
    const rank = vi.spyOn(registry, "rankSearch");
    const fetcher = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    try {
      const matches = await registry.rankSearchWithSystemOne("files", { limit: 1 }, { JEV_API_KEY: "bounded-search-regression" });
      expect(rank).toHaveBeenCalledTimes(1);
      expect(matches).toHaveLength(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
