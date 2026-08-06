import { describe, expect, it, vi } from "vitest";
import { getVoiceToolSchemas, executeVoiceTool } from "./tools.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolDefinition, ToolResult } from "../tools/contracts.js";

function fakeTool(name: string, tier: "core" | "standard" | "external"): ToolDefinition {
  return {
    name,
    description: `desc for ${name}`,
    parameters: { type: "object", properties: {} },
    tier,
    execute: async () => ({ ok: true, message: "ok" }),
  };
}

function fakeRegistry(tools: ToolDefinition[]): ToolRegistry {
  return { list: () => tools } as unknown as ToolRegistry;
}

describe("getVoiceToolSchemas registry merge", () => {
  it("includes built-in voice tools plus registry tools, excluding external tier", () => {
    const registry = fakeRegistry([
      fakeTool("file.read", "core"),
      fakeTool("terminal.run", "standard"),
      fakeTool("mcp.external", "external"),
    ]);

    const schemas = getVoiceToolSchemas(registry);
    const names = schemas.map((s) => s.name);

    // Built-in voice tools present
    expect(names).toContain("get_time_and_date");
    expect(names).toContain("select_project");
    expect(names).toContain("stop_voice");
    expect(names).toContain("list_background_tasks");
    expect(names).toContain("cancel_background_task");

    // Registry tools present (non-external)
    expect(names).toContain("file.read");
    expect(names).toContain("terminal.run");

    // External tier excluded
    expect(names).not.toContain("mcp.external");
  });

  it("built-in voice tools win on name collisions with registry tools", () => {
    const registry = fakeRegistry([fakeTool("get_time_and_date", "core")]);
    const schemas = getVoiceToolSchemas(registry);
    const matches = schemas.filter((s) => s.name === "get_time_and_date");
    expect(matches).toHaveLength(1);
  });

  it("returns only built-ins when no registry is provided", () => {
    const schemas = getVoiceToolSchemas();
    expect(schemas.length).toBeGreaterThan(0);
    expect(schemas.every((s) => s.type === "function")).toBe(true);
    const names = schemas.map((s) => s.name);
    expect(names).toContain("list_background_tasks");
    expect(names).toContain("cancel_background_task");
  });
});

describe("executeVoiceTool consent routing", () => {
  it("routes non-built-in tools through the toolExecutor with requestedBy voice-assistant", async () => {
    const executor = vi.fn(async (_name: string, _input: unknown, ctx: any): Promise<ToolResult> => {
      expect(ctx.requestedBy).toBe("voice-assistant");
      expect(ctx.sessionId).toBe("sess-1");
      expect(ctx.actionId).toBe("act-1");
      expect(ctx.projectRoot).toBe("/proj");
      return { ok: true, message: "done", data: { ok: true } };
    });

    const result = await executeVoiceTool("file.read", { path: "/x" }, {
      config: {} as any,
      toolExecutor: executor,
      sessionId: "sess-1",
      actionId: "act-1",
      projectRoot: "/proj",
      userId: "u1",
    });

    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith(
      "file.read",
      { path: "/x" },
      expect.objectContaining({ requestedBy: "voice-assistant" }),
    );
    expect(result).toContain("done");
  });

  it("returns blocked message when executor returns ok:false", async () => {
    const executor = vi.fn(async () => ({ ok: false, message: "consent denied" }));
    const result = await executeVoiceTool("file.write", { path: "/x" }, {
      config: {} as any,
      toolExecutor: executor,
    });
    expect(result).toBe("Tool blocked: consent denied");
  });

  it("returns unknown tool when no executor is provided", async () => {
    const result = await executeVoiceTool("file.read", { path: "/x" }, { config: {} as any });
    expect(result).toBe("Unknown tool: file.read");
  });

  it("executes built-in tools locally without the executor", async () => {
    const executor = vi.fn();
    const result = await executeVoiceTool("get_time_and_date", {}, {
      config: {} as any,
      toolExecutor: executor,
    });
    expect(executor).not.toHaveBeenCalled();
    expect(typeof result).toBe("string");
  });
});
