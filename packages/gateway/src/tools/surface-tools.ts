/**
 * Surface Control Tools — Sprint 3.8
 *
 * surfaces.list  — list all active surfaces
 * surfaces.start — start a new surface
 * surfaces.stop  — stop a surface by ID
 */

import type { ToolDefinition, ToolContext, ToolResult } from "./contracts.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";

export function createSurfacesListTool(registry: SurfaceRegistry): ToolDefinition<Record<string, never>> {
  return {
    name: "surfaces.list",
    description: "List all active surfaces and their current state",
    parameters: {
      type: "object",
      properties: {},
    },
    async execute(_input: Record<string, never>, _context: ToolContext): Promise<ToolResult> {
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

interface SurfaceStartInput {
  type: string;
  sessionId?: string;
  workspaceRoot?: string;
}

export function createSurfacesStartTool(registry: SurfaceRegistry): ToolDefinition<SurfaceStartInput> {
  return {
    name: "surfaces.start",
    description: "Start a new surface of the given type (terminal, filesystem)",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", description: "Surface type to start", enum: ["terminal", "filesystem"] },
        sessionId: { type: "string", description: "Session to attach the surface to" },
        workspaceRoot: { type: "string", description: "Working directory for the surface" },
      },
      required: ["type"],
    },
    async execute(input: SurfaceStartInput, context: ToolContext): Promise<ToolResult> {
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
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Failed to start surface",
        };
      }
    },
  };
}

interface SurfaceStopInput {
  surfaceId: string;
  reason?: string;
}

export function createSurfacesStopTool(registry: SurfaceRegistry): ToolDefinition<SurfaceStopInput> {
  return {
    name: "surfaces.stop",
    description: "Stop a running surface by its ID",
    parameters: {
      type: "object",
      properties: {
        surfaceId: { type: "string", description: "ID of the surface to stop" },
        reason: { type: "string", description: "Reason for stopping" },
      },
      required: ["surfaceId"],
    },
    async execute(input: SurfaceStopInput, _context: ToolContext): Promise<ToolResult> {
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
