import type { ToolDefinition, ToolResult } from "./contracts.js";
import type { SessionService } from "../services/sessions.js";
import type { SurfaceRegistry } from "../surfaces/index.js";
import type { WsControlPlane } from "../ws.js";

export function createGatewayStatusTool(deps: {
  sessionService: SessionService;
  surfaceRegistry: SurfaceRegistry;
  ws: WsControlPlane;
  startedAt: number;
}): ToolDefinition {
  return {
    name: "gateway.status",
    description: "Return gateway runtime health information",
    parameters: { type: "object", properties: {} },
    execute: async (): Promise<ToolResult> => {
      const sessions = deps.sessionService.list("active").length;
      const surfaces = deps.surfaceRegistry.listSurfaces().length;
      const devices = deps.ws.clientCount;
      return {
        ok: true,
        message: "Gateway status",
        data: {
          healthy: true,
          uptime: Math.floor((Date.now() - deps.startedAt) / 1000),
          sessions,
          surfaces,
          devices,
          activeServices: ["ws-control-plane", "scheduler", "consent-manager"],
        },
      };
    },
  };
}
