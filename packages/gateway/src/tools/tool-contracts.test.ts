import { describe, expect, it, vi } from "vitest";
import { SurfaceRegistry } from "../surfaces/registry.js";
import { createToolRegistry, type ToolRegistryDeps } from "./index.js";
import type { ToolContext } from "./contracts.js";

// Enable every optional built-in registration without contacting any service.
// A malformed call must be rejected before any of these services are used.
const unavailableService = new Proxy({}, {
  get(_target, property) {
    throw new Error(`Unexpected service access: ${String(property)}`);
  },
});
const deps = Object.fromEntries([
  "scheduler", "sessionService", "ws", "memoryService", "voiceService",
  "screenShare", "threadService", "providerRegistry", "projectService",
  "repoService", "repoProposalService", "sessionSearchService",
  "sessionSqlService", "chatTracesService", "maintenanceService",
  "mobilePush", "previewService", "codeGraphService", "userQuestionService",
  "emailService", "calendarService", "skillRegistry",
].map((key) => [key, unavailableService])) as ToolRegistryDeps;
deps.config = { host: "127.0.0.1", port: 8100 } as ToolRegistryDeps["config"];
deps.shutdown = async () => { throw new Error("Unexpected shutdown"); };
const registry = createToolRegistry(new SurfaceRegistry(), deps);
const tools = registry.list();
const context: ToolContext = {
  sessionId: "contract-session", actionId: "contract-action",
  projectRoot: process.cwd(), requestedBy: "test", userId: "contract-user",
};

describe.each(tools.map((tool) => [tool.name, tool] as const))("%s public contract", (_name, tool) => {
  it("is listed and discoverable by its exact name", () => {
    expect(registry.listInfo()).toContainEqual(expect.objectContaining({
      name: tool.name, description: expect.any(String), source: "builtin",
    }));
    expect(tool.description.length).toBeGreaterThan(0);
    expect(registry.search(tool.name, { limit: 20 }).map((match) => match.name)).toContain(tool.name);
    expect(tool.parameters.type).toBe("object");
    for (const required of tool.parameters.required ?? []) {
      expect(tool.parameters.properties).toHaveProperty(required);
    }
  });

  it("rejects non-object arguments before executing or accessing dependencies", async () => {
    const execute = vi.spyOn(tool, "execute");
    try {
      for (const input of ["invalid arguments", 123, []]) {
        const result = await registry.execute(tool.name, input, context);
        expect(result.ok).toBe(false);
        expect(result.message).toContain("Input validation failed");
      }
      expect(execute).not.toHaveBeenCalled();
    } finally {
      execute.mockRestore();
    }
  });

  if ((tool.parameters.required?.length ?? 0) > 0) {
    it("rejects missing required arguments before executing", async () => {
      const execute = vi.spyOn(tool, "execute");
      try {
        const result = await registry.execute(tool.name, {}, context);
        expect(result.ok).toBe(false);
        expect(result.message).toContain("Input validation failed");
        expect(execute).not.toHaveBeenCalled();
      } finally {
        execute.mockRestore();
      }
    });
  }
});
