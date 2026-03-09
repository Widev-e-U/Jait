import type { ToolDefinition } from "./contracts.js";
import type { SessionService } from "../services/sessions.js";
import type { SurfaceRegistry } from "../surfaces/index.js";
import type { WsControlPlane } from "../ws.js";
import type { SchedulerService } from "../scheduler/service.js";
import type { HookBus } from "../scheduler/hooks.js";
export declare function createGatewayStatusTool(deps: {
    sessionService: SessionService;
    surfaceRegistry: SurfaceRegistry;
    ws: WsControlPlane;
    startedAt: number;
    scheduler?: SchedulerService;
    hooks?: HookBus;
}): ToolDefinition;
//# sourceMappingURL=gateway-tools.d.ts.map