import type { FastifyInstance } from "fastify";
import { type AppConfig } from "../config.js";
import type { JaitDB } from "../db/index.js";
import type { SessionService } from "../services/sessions.js";
import type { UserService } from "../services/users.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolContext } from "../tools/contracts.js";
import type { AuditWriter } from "../services/audit.js";
import type { ToolResult } from "../tools/contracts.js";
import type { MemoryService } from "../memory/contracts.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import type { WsControlPlane } from "../ws.js";
import type { SessionStateService } from "../services/session-state.js";
import type { ProviderRegistry } from "../providers/registry.js";
export interface ChatRouteDeps {
    db?: JaitDB;
    sessionService?: SessionService;
    userService?: UserService;
    toolRegistry?: ToolRegistry;
    surfaceRegistry?: SurfaceRegistry;
    audit?: AuditWriter;
    memoryService?: MemoryService;
    ws?: WsControlPlane;
    sessionState?: SessionStateService;
    providerRegistry?: ProviderRegistry;
    toolExecutor?: (toolName: string, input: unknown, context: ToolContext, options?: {
        dryRun?: boolean;
        consentTimeoutMs?: number;
    }) => Promise<ToolResult>;
}
export declare function registerChatRoutes(app: FastifyInstance, config: AppConfig, depsOrDb?: JaitDB | ChatRouteDeps, sessionServiceArg?: SessionService): void;
//# sourceMappingURL=chat.d.ts.map