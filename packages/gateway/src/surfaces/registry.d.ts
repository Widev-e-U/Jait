import type { Surface, SurfaceFactory, SurfaceSnapshot, SurfaceStartInput } from "./contracts.js";
export declare class SurfaceRegistry {
    private readonly factories;
    private readonly surfaces;
    /** Called after every surface is started (regardless of creation path) */
    onSurfaceStarted?: (id: string, surface: Surface) => void;
    /** Called just before a surface is removed after stopping */
    onSurfaceStopped?: (id: string, surface: Surface) => void;
    register(factory: SurfaceFactory): void;
    /** Create + start a surface in one call */
    startSurface(type: string, id: string, input: SurfaceStartInput): Promise<Surface>;
    /** Stop + remove a surface */
    stopSurface(id: string, reason?: string): Promise<boolean>;
    getSurface(id: string): Surface | undefined;
    listSurfaces(): Surface[];
    listSnapshots(): SurfaceSnapshot[];
    /** Get surfaces belonging to a specific session */
    getBySession(sessionId: string): Surface[];
    unregister(id: string): boolean;
    /** Stop all surfaces (used during shutdown) */
    stopAll(reason?: string): Promise<void>;
    get registeredTypes(): string[];
}
//# sourceMappingURL=registry.d.ts.map