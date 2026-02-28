import type { Surface, SurfaceFactory, SurfaceStartInput, SurfaceStopInput } from "./contracts.js";

export class SurfaceRegistry {
  private readonly factories = new Map<string, SurfaceFactory>();
  private readonly surfaces = new Map<string, Surface>();

  register(factory: SurfaceFactory): void {
    this.factories.set(factory.type, factory);
  }

  async startSurface(type: string, id: string, input: SurfaceStartInput): Promise<Surface> {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new Error(`Surface factory '${type}' is not registered`);
    }

    const instance = factory.create(id);
    await instance.start(input);
    this.surfaces.set(id, instance);
    return instance;
  }

  getSurface(id: string): Surface | undefined {
    return this.surfaces.get(id);
  }

  listSurfaces(): Surface[] {
    return [...this.surfaces.values()];
  }

  async unregister(id: string, input?: SurfaceStopInput): Promise<boolean> {
    const surface = this.surfaces.get(id);
    if (!surface) {
      return false;
    }

    await surface.stop(input);
    return this.surfaces.delete(id);
  }
}
