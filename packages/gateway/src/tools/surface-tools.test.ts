import { describe, expect, it, vi } from "vitest";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import { createSurfacesListTool, createSurfacesStartTool, createSurfacesStopTool } from "./surface-tools.js";
const context = { sessionId: "surface-tests", actionId: "surface-action", projectRoot: "/project", requestedBy: "test" };
function fixture() {
  const snapshot = { id: "browser-1", type: "browser", state: "running", sessionId: context.sessionId };
  const registry = {
    registeredTypes: ["browser", "terminal", "filesystem"],
    listSnapshots: vi.fn().mockReturnValue([snapshot]),
    startSurface: vi.fn().mockResolvedValue({ snapshot: () => snapshot }),
    stopSurface: vi.fn().mockResolvedValue(true),
  };
  return { snapshot, registry, service: registry as unknown as SurfaceRegistry };
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
  it("starts a unique browser attached to the caller's project and session", async () => {
    const f = fixture();
    expect((await createSurfacesStartTool(f.service).execute({ type: "browser" }, context)).ok).toBe(true);
    expect(f.registry.startSurface).toHaveBeenCalledWith("browser", expect.stringMatching(/^browser-/), { sessionId: context.sessionId, projectRoot: context.projectRoot });
  });
  it("reports launch failures to the user", async () => {
    const f = fixture();
    f.registry.startSurface.mockRejectedValue(new Error("Chromium unavailable"));
    expect(await createSurfacesStartTool(f.service).execute({ type: "browser" }, context)).toEqual({ ok: false, message: "Chromium unavailable" });
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
