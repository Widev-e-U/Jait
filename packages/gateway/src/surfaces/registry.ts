import type { Surface, SurfaceFactory, SurfaceSnapshot, SurfaceStartInput } from "./contracts.js";

export class SurfaceRegistry {
  private readonly factories = new Map<string, SurfaceFactory>();
  private readonly surfaces = new Map<string, Surface>();

  /** Called after every surface is started (regardless of creation path) */
  onSurfaceStarted?: (id: string, surface: Surface) => void;
  /** Called just before a surface is removed after stopping */
  onSurfaceStopped?: (id: string, surface: Surface) => void;

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
    this.surfaces.set(id, instance);
    await instance.start(input);
    this.onSurfaceStarted?.(id, instance);
    return instance;
  }

  /** Stop + remove a surface */
  async stopSurface(id: string, reason?: string): Promise<boolean> {
    const surface = this.surfaces.get(id);
    if (!surface) return false;
    const snap = surface.snapshot();
    await surface.stop({ reason });
    this.onSurfaceStopped?.(id, { ...surface, snapshot: () => snap } as Surface);
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
