import { describe, expect, it, vi } from "vitest";
import { validateToolInput } from "./validate.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import { createSurfacesListTool, createSurfacesStartTool, createSurfacesStopTool } from "./surface-tools.js";
const context = { sessionId: "surface-tests", actionId: "surface-action", projectRoot: "/project", requestedBy: "test" };
function fixture() {
  const snapshot = { id: "browser-1", type: "browser", state: "running", sessionId: context.sessionId };
  const page = { url: "https://example.com/", title: "Example", text: "Loaded", elements: [] };
  const surface = { ...snapshot, snapshot: () => snapshot, navigate: vi.fn().mockResolvedValue(page) };
  let started = false;
  const registry = {
    registeredTypes: ["browser", "terminal", "filesystem"],
    listSnapshots: vi.fn().mockReturnValue([snapshot]),
    getSurface: vi.fn(() => started ? surface : undefined),
    startSurface: vi.fn(async () => { started = true; return surface; }),
    stopSurface: vi.fn().mockResolvedValue(true),
  };
  return { snapshot, surface, registry, service: registry as unknown as SurfaceRegistry };
}
describe("surfaces.list", () => {
  it("returns current snapshots and supported types", async () => {
    const f = fixture();
    expect(await createSurfacesListTool(f.service).execute({}, context)).toMatchObject({
      ok: true, data: { surfaces: [f.snapshot], registeredTypes: ["browser", "terminal", "filesystem"] },
    });
  });
  it("handles no active surfaces", async () => {
    const f = fixture();
    f.registry.listSnapshots.mockReturnValue([]);
    expect((await createSurfacesListTool(f.service).execute({}, context)).message).toBe("0 active surface(s).");
  });
});
describe("surfaces.start", () => {
  it("requires a URL and loads it in the chat browser", async () => {
    const f = fixture();
    const tool = createSurfacesStartTool(f.service);
    expect(validateToolInput(tool.parameters, { type: "browser" }).valid).toBe(false);
    expect(validateToolInput(tool.parameters, { type: "terminal" }).valid).toBe(true);
    expect((await tool.execute({ type: "browser" }, context)).ok).toBe(false);
    expect((await tool.execute({ type: "browser", url: "file:///etc/passwd" }, context)).ok).toBe(false);
    expect(f.registry.startSurface).not.toHaveBeenCalled();
    expect(await tool.execute({ type: "browser", url: "https://example.com/" }, context)).toMatchObject({ ok: true, data: { url: "https://example.com/" } });
    expect(f.registry.startSurface).toHaveBeenCalledWith("browser", `browser-${context.sessionId}`, { sessionId: context.sessionId, projectRoot: context.projectRoot, userId: undefined });
    expect(f.surface.navigate).toHaveBeenCalledWith("https://example.com/", undefined);
  });
  it("reports launch failures to the user", async () => {
    const f = fixture();
    f.registry.startSurface.mockRejectedValue(new Error("Chromium unavailable"));
    expect(await createSurfacesStartTool(f.service).execute({ type: "browser", url: "https://example.com/" }, context)).toEqual({ ok: false, message: "Chromium unavailable" });
  });
  it("does not require a URL for non-browser surfaces", async () => {
    const f = fixture();
    expect((await createSurfacesStartTool(f.service).execute({ type: "terminal" }, context)).ok).toBe(true);
  });
});
describe("surfaces.stop", () => {
  it.each([true, false])("reports stop outcome %s and forwards its reason", async (stopped) => {
    const f = fixture();
    f.registry.stopSurface.mockResolvedValue(stopped);
    expect((await createSurfacesStopTool(f.service).execute({ surfaceId: "browser-1", reason: "test complete" }, context)).ok).toBe(stopped);
    expect(f.registry.stopSurface).toHaveBeenCalledWith("browser-1", "test complete");
  });
});
