import { describe, expect, it } from "vitest";
import type { Surface, SurfaceFactory, SurfaceState } from "./contracts.js";
import { SurfaceRegistry } from "./registry.js";

class MockSurface implements Surface {
  state: SurfaceState = "idle";
  sessionId: string | null = null;

  constructor(
    public readonly id: string,
    public readonly type: string,
  ) {}

  async start(input: { sessionId: string; workspaceRoot: string }): Promise<void> {
    this.sessionId = input.sessionId;
    this.state = "running";
  }

  async stop(): Promise<void> {
    this.state = "stopped";
  }

  snapshot() {
    return {
      id: this.id,
      type: this.type,
      state: this.state,
      sessionId: this.sessionId ?? "",
      metadata: {},
    };
  }
}

const mockFactory: SurfaceFactory = {
  type: "terminal",
  create: (id) => new MockSurface(id, "terminal"),
};

describe("SurfaceRegistry", () => {
  it("registers and starts surfaces by type", async () => {
    const registry = new SurfaceRegistry();
    registry.register(mockFactory);

    const surface = await registry.startSurface("terminal", "surface-1", {
      sessionId: "session-1",
      workspaceRoot: "/tmp",
    });

    expect(surface.id).toBe("surface-1");
    expect(surface.state).toBe("running");
    expect(registry.getSurface("surface-1")).toBe(surface);
  });

  it("throws when factory is missing", async () => {
    const registry = new SurfaceRegistry();
    await expect(
      registry.startSurface("missing", "surface-1", {
        sessionId: "s1",
        workspaceRoot: "/tmp",
      }),
    ).rejects.toThrow("Surface factory 'missing' is not registered");
  });

  it("stops and removes a surface", async () => {
    const registry = new SurfaceRegistry();
    registry.register(mockFactory);

    await registry.startSurface("terminal", "s1", {
      sessionId: "session-1",
      workspaceRoot: "/tmp",
    });

    const stopped = await registry.stopSurface("s1");
    expect(stopped).toBe(true);
    expect(registry.getSurface("s1")).toBeUndefined();
  });

  it("lists snapshots for all surfaces", async () => {
    const registry = new SurfaceRegistry();
    registry.register(mockFactory);

    await registry.startSurface("terminal", "s1", { sessionId: "a", workspaceRoot: "/tmp" });
    await registry.startSurface("terminal", "s2", { sessionId: "b", workspaceRoot: "/tmp" });

    const snaps = registry.listSnapshots();
    expect(snaps).toHaveLength(2);
    expect(snaps.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
  });

  it("filters surfaces by session", async () => {
    const registry = new SurfaceRegistry();
    registry.register(mockFactory);

    await registry.startSurface("terminal", "s1", { sessionId: "a", workspaceRoot: "/tmp" });
    await registry.startSurface("terminal", "s2", { sessionId: "b", workspaceRoot: "/tmp" });
    await registry.startSurface("terminal", "s3", { sessionId: "a", workspaceRoot: "/tmp" });

    expect(registry.getBySession("a")).toHaveLength(2);
    expect(registry.getBySession("b")).toHaveLength(1);
  });

  it("stopAll shuts down everything", async () => {
    const registry = new SurfaceRegistry();
    registry.register(mockFactory);

    await registry.startSurface("terminal", "s1", { sessionId: "a", workspaceRoot: "/tmp" });
    await registry.startSurface("terminal", "s2", { sessionId: "a", workspaceRoot: "/tmp" });

    await registry.stopAll();
    expect(registry.listSurfaces()).toHaveLength(0);
  });
});
