/**
 * Surface Control Tools — Sprint 3.8
 *
 * surfaces.list  — list all active surfaces
 * surfaces.start — start a new surface
 * surfaces.stop  — stop a surface by ID
 */
export function createSurfacesListTool(registry) {
    return {
        name: "surfaces.list",
        description: "List all active surfaces and their current state",
        tier: "standard",
        category: "surfaces",
        source: "builtin",
        parameters: {
            type: "object",
            properties: {},
        },
        async execute(_input, _context) {
            const snapshots = registry.listSnapshots();
            return {
                ok: true,
                message: `${snapshots.length} active surface(s)`,
                data: {
                    surfaces: snapshots,
                    registeredTypes: registry.registeredTypes,
                },
            };
        },
    };
}
export function createSurfacesStartTool(registry) {
    return {
        name: "surfaces.start",
        description: "Start a new surface of the given type (terminal, filesystem, browser)",
        tier: "standard",
        category: "surfaces",
        source: "builtin",
        parameters: {
            type: "object",
            properties: {
                type: { type: "string", description: "Surface type to start", enum: ["terminal", "filesystem", "browser"] },
                sessionId: { type: "string", description: "Session to attach the surface to" },
                workspaceRoot: { type: "string", description: "Working directory for the surface" },
            },
            required: ["type"],
        },
        async execute(input, context) {
            try {
                const { uuidv7 } = await import("../lib/uuidv7.js");
                const surfaceId = `${input.type}-${uuidv7()}`;
                const surface = await registry.startSurface(input.type, surfaceId, {
                    sessionId: input.sessionId ?? context.sessionId,
                    workspaceRoot: input.workspaceRoot ?? context.workspaceRoot,
                });
                return {
                    ok: true,
                    message: `Started ${input.type} surface: ${surfaceId}`,
                    data: surface.snapshot(),
                };
            }
            catch (err) {
                return {
                    ok: false,
                    message: err instanceof Error ? err.message : "Failed to start surface",
                };
            }
        },
    };
}
export function createSurfacesStopTool(registry) {
    return {
        name: "surfaces.stop",
        description: "Stop a running surface by its ID",
        tier: "standard",
        category: "surfaces",
        source: "builtin",
        parameters: {
            type: "object",
            properties: {
                surfaceId: { type: "string", description: "ID of the surface to stop" },
                reason: { type: "string", description: "Reason for stopping" },
            },
            required: ["surfaceId"],
        },
        async execute(input, _context) {
            const stopped = await registry.stopSurface(input.surfaceId, input.reason);
            if (!stopped) {
                return { ok: false, message: `Surface not found: ${input.surfaceId}` };
            }
            return {
                ok: true,
                message: `Stopped surface: ${input.surfaceId}`,
                data: { surfaceId: input.surfaceId },
            };
        },
    };
}
//# sourceMappingURL=surface-tools.js.map