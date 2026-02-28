import type { Surface, SurfaceFactory, SurfaceSnapshot, SurfaceStartInput } from "./contracts.js";

export class SurfaceRegistry {
  private readonly factories = new Map<string, SurfaceFactory>();
  private readonly surfaces = new Map<string, Surface>();

  register(factory: SurfaceFactory): void {
    this.factories.set(factory.type, factory);
  }

  /** Create + start a surface in one call */
  async startSurface(
    type: string,
    id: string,
    input: SurfaceStartInput,
  ): Promise<Surface> {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new Error(`Surface factory '${type}' is not registered`);
    }

    const instance = factory.create(id);
    await instance.start(input);
    this.surfaces.set(id, instance);
    await instance.start(input);
    return instance;
  }

  /** Stop + remove a surface */
  async stopSurface(id: string, reason?: string): Promise<boolean> {
    const surface = this.surfaces.get(id);
    if (!surface) return false;
    await surface.stop({ reason });
    this.surfaces.delete(id);
    return true;
  }

  getSurface(id: string): Surface | undefined {
    return this.surfaces.get(id);
  }

  listSurfaces(): Surface[] {
    return [...this.surfaces.values()];
  }

  listSnapshots(): SurfaceSnapshot[] {
    return this.listSurfaces().map((s) => s.snapshot());
  }

  /** Get surfaces belonging to a specific session */
  getBySession(sessionId: string): Surface[] {
    return this.listSurfaces().filter((s) => s.sessionId === sessionId);
  }

  unregister(id: string): boolean {
    return this.surfaces.delete(id);
  }

  /** Stop all surfaces (used during shutdown) */
  async stopAll(reason = "shutdown"): Promise<void> {
    const ids = [...this.surfaces.keys()];
    await Promise.allSettled(ids.map((id) => this.stopSurface(id, reason)));
  }

  get registeredTypes(): string[] {
    return [...this.factories.keys()];
  }
}
