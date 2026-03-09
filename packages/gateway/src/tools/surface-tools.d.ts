/**
 * Surface Control Tools — Sprint 3.8
 *
 * surfaces.list  — list all active surfaces
 * surfaces.start — start a new surface
 * surfaces.stop  — stop a surface by ID
 */
import type { ToolDefinition } from "./contracts.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
export declare function createSurfacesListTool(registry: SurfaceRegistry): ToolDefinition<Record<string, never>>;
interface SurfaceStartInput {
    type: string;
    sessionId?: string;
    workspaceRoot?: string;
}
export declare function createSurfacesStartTool(registry: SurfaceRegistry): ToolDefinition<SurfaceStartInput>;
interface SurfaceStopInput {
    surfaceId: string;
    reason?: string;
}
export declare function createSurfacesStopTool(registry: SurfaceRegistry): ToolDefinition<SurfaceStopInput>;
export {};
//# sourceMappingURL=surface-tools.d.ts.map