import { describe, expect, it } from "vitest";
import type { Surface, SurfaceFactory } from "./contracts.js";
import { SurfaceRegistry } from "./registry.js";

class MockSurface implements Surface {
  constructor(
    public readonly id: string,
    public readonly type: string,
  ) {}

  async start(): Promise<void> {
    return;
  }

  async stop(): Promise<void> {
    return;
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
  it("registers and starts surfaces by type", () => {
    const registry = new SurfaceRegistry();
    registry.register(mockFactory);

    const surface = registry.startSurface("terminal", "surface-1");

    expect(surface.id).toBe("surface-1");
    expect(registry.getSurface("surface-1")).toBe(surface);
  });

  it("throws when factory is missing", () => {
    const registry = new SurfaceRegistry();
    expect(() => registry.startSurface("missing", "surface-1")).toThrow(
      "Surface factory 'missing' is not registered",
    );
  });
});
