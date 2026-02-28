import type { Surface, SurfaceFactory } from "./contracts.js";

export class SurfaceRegistry {
  private readonly factories = new Map<string, SurfaceFactory>();
  private readonly surfaces = new Map<string, Surface>();

  register(factory: SurfaceFactory): void {
    this.factories.set(factory.type, factory);
  }

  startSurface(type: string, id: string): Surface {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new Error(`Surface factory '${type}' is not registered`);
    }

    const instance = factory.create(id);
    this.surfaces.set(id, instance);
    return instance;
  }

  getSurface(id: string): Surface | undefined {
    return this.surfaces.get(id);
  }

  listSurfaces(): Surface[] {
    return [...this.surfaces.values()];
  }

  unregister(id: string): boolean {
    return this.surfaces.delete(id);
  }
}
