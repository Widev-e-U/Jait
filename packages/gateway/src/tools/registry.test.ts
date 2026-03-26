import { describe, expect, it, vi } from "vitest";
import type { AuditWriter } from "../services/audit.js";
import { ToolRegistry } from "./registry.js";

function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    workspaceRoot: process.cwd(),
    requestedBy: "test",
  };
}

describe("ToolRegistry audit and validation behavior", () => {
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
