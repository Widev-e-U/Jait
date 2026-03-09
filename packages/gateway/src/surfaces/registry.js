export class SurfaceRegistry {
    factories = new Map();
    surfaces = new Map();
    /** Called after every surface is started (regardless of creation path) */
    onSurfaceStarted;
    /** Called just before a surface is removed after stopping */
    onSurfaceStopped;
    register(factory) {
        this.factories.set(factory.type, factory);
    }
    /** Create + start a surface in one call */
    async startSurface(type, id, input) {
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
    async stopSurface(id, reason) {
        const surface = this.surfaces.get(id);
        if (!surface)
            return false;
        const snap = surface.snapshot();
        await surface.stop({ reason });
        this.onSurfaceStopped?.(id, { ...surface, snapshot: () => snap });
        this.surfaces.delete(id);
        return true;
    }
    getSurface(id) {
        return this.surfaces.get(id);
    }
    listSurfaces() {
        return [...this.surfaces.values()];
    }
    listSnapshots() {
        return this.listSurfaces().map((s) => s.snapshot());
    }
    /** Get surfaces belonging to a specific session */
    getBySession(sessionId) {
        return this.listSurfaces().filter((s) => s.sessionId === sessionId);
    }
    unregister(id) {
        return this.surfaces.delete(id);
    }
    /** Stop all surfaces (used during shutdown) */
    async stopAll(reason = "shutdown") {
        const ids = [...this.surfaces.keys()];
        await Promise.allSettled(ids.map((id) => this.stopSurface(id, reason)));
    }
    get registeredTypes() {
        return [...this.factories.keys()];
    }
}
//# sourceMappingURL=registry.js.map