import { describe, expect, it } from "vitest";
import type { Surface, SurfaceFactory } from "./contracts.js";
import { SurfaceRegistry } from "./registry.js";

class MockSurface implements Surface {
  public startCalls = 0;
  public stopCalls = 0;

  constructor(
    public readonly id: string,
    public readonly type: string,
  ) {}

  async start(): Promise<void> {
    this.startCalls += 1;
  }

  async stop(): Promise<void> {
    this.stopCalls += 1;
  }

  snapshot() {
    return {
      id: this.id,
      type: this.type,
      state: "idle" as const,
      sessionId: "session-1",
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
      workspaceRoot: "/workspace/Jait",
    });

    expect(surface.id).toBe("surface-1");
    expect((surface as MockSurface).startCalls).toBe(1);
    expect(registry.getSurface("surface-1")).toBe(surface);
  });

  it("throws when factory is missing", async () => {
    const registry = new SurfaceRegistry();
    await expect(
      registry.startSurface("missing", "surface-1", {
        sessionId: "session-1",
        workspaceRoot: "/workspace/Jait",
      }),
    ).rejects.toThrow("Surface factory 'missing' is not registered");
  });

  it("stops a running surface before unregistering it", async () => {
    const registry = new SurfaceRegistry();
    registry.register(mockFactory);

    const surface = (await registry.startSurface("terminal", "surface-1", {
      sessionId: "session-1",
      workspaceRoot: "/workspace/Jait",
    })) as MockSurface;

    const deleted = await registry.unregister("surface-1", {
      reason: "test cleanup",
    });

    expect(deleted).toBe(true);
    expect(surface.stopCalls).toBe(1);
    expect(registry.getSurface("surface-1")).toBeUndefined();
  });

  it("returns false when unregistering a missing surface", async () => {
    const registry = new SurfaceRegistry();

    const deleted = await registry.unregister("missing-surface", {
      reason: "noop",
    });

    expect(deleted).toBe(false);
  });
});
