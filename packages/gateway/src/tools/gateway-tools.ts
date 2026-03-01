import type { ToolDefinition, ToolResult } from "./contracts.js";
import type { SessionService } from "../services/sessions.js";
import type { SurfaceRegistry } from "../surfaces/index.js";
import type { WsControlPlane } from "../ws.js";
import type { SchedulerService } from "../scheduler/service.js";
import type { HookBus } from "../scheduler/hooks.js";

export function createGatewayStatusTool(deps: {
  sessionService: SessionService;
  surfaceRegistry: SurfaceRegistry;
  ws: WsControlPlane;
  startedAt: number;
  scheduler?: SchedulerService;
  hooks?: HookBus;
}): ToolDefinition {
  return {
    name: "gateway.status",
    description: "Return gateway runtime health information",
    parameters: { type: "object", properties: {} },
    execute: async (): Promise<ToolResult> => {
      const sessions = deps.sessionService.list("active").length;
      const surfaces = deps.surfaceRegistry.listSurfaces().length;
      const devices = deps.ws.clientCount;
      const jobs = deps.scheduler?.list() ?? [];
      const enabledJobs = jobs.filter((job) => job.enabled).length;
      const hookEventTypes = deps.hooks?.registeredEventTypes() ?? [];
      return {
        ok: true,
        message: "Gateway status",
        data: {
          healthy: true,
          uptime: Math.floor((Date.now() - deps.startedAt) / 1000),
          sessions,
          surfaces,
          devices,
          activeServices: ["ws-control-plane", "scheduler", "consent-manager", "hooks"],
          scheduler: {
            totalJobs: jobs.length,
            enabledJobs,
          },
          hooks: {
            registeredEventTypes: hookEventTypes,
            listeners: deps.hooks?.listenerCount() ?? 0,
          },
        },
      };
    },
  };
}
