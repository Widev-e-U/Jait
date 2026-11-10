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
    tier: "standard",
    category: "gateway",
    source: "builtin",
    parameters: { type: "object", properties: {} },
    execute: async (): Promise<ToolResult> => {
      const sessions = deps.sessionService.list("active").length;
      const surfaces = deps.surfaceRegistry.listSurfaces().length;
      const devices = deps.ws.clientCount;
      const jobs = deps.scheduler?.list() ?? [];
      const enabledJobs = jobs.filter((job) => job.enabled).length;
      const hookEventTypes = deps.hooks?.registeredEventTypes() ?? [];
      const uptime = Math.floor((Date.now() - deps.startedAt) / 1000);
      const h = Math.floor(uptime / 3600);
      const m = Math.floor((uptime % 3600) / 60);
      const uptimeText = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${uptime % 60}s` : `${uptime}s`;
      return {
        ok: true,
        message:
          `Gateway healthy — up ${uptimeText}, ${sessions} active session(s), ${surfaces} surface(s), ` +
          `${devices} device(s), ${enabledJobs}/${jobs.length} cron job(s) enabled, ` +
          `${hookEventTypes.length} hook event type(s).`,
        data: {
          healthy: true,
          uptime,
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
