/**
 * jait — Platform meta-tool for Jait-specific capabilities.
 *
 * Combines: memory management, cron/scheduler, network scanning,
 * and gateway status into a single tool with an `action` dispatcher.
 *
 * This keeps the core tool count at 8 while still exposing
 * platform-specific features that don't fit the generic tools.
 */
import type { ToolDefinition } from "../contracts.js";
import type { SchedulerService } from "../../scheduler/service.js";
import type { MemoryService } from "../../memory/contracts.js";
import type { SessionService } from "../../services/sessions.js";
import type { SurfaceRegistry } from "../../surfaces/registry.js";
import type { WsControlPlane } from "../../ws.js";
import type { HookBus } from "../../scheduler/hooks.js";
export interface JaitToolDeps {
    memoryService?: MemoryService;
    scheduler?: SchedulerService;
    sessionService?: SessionService;
    surfaceRegistry?: SurfaceRegistry;
    ws?: WsControlPlane;
    startedAt?: number;
    hooks?: HookBus;
}
interface JaitInput {
    /** The action to perform */
    action: string;
    /** Memory content to save */
    content?: string;
    /** Memory scope: workspace, project, or contact */
    scope?: string;
    /** Search query for memory.search */
    query?: string;
    /** Memory ID (for forget) */
    memoryId?: string;
    /** Source type for memory save */
    sourceType?: string;
    /** Source ID for memory save */
    sourceId?: string;
    /** TTL in seconds for memory expiry */
    ttlSeconds?: number;
    /** Max results for memory search */
    limit?: number;
    /** Cron job name */
    name?: string;
    /** Cron expression */
    cron?: string;
    /** Tool name to execute on schedule */
    toolName?: string;
    /** Tool input arguments */
    input?: Record<string, unknown>;
    /** Cron job ID (for update/remove) */
    jobId?: string;
    /** Enable/disable flag for cron update */
    enabled?: boolean;
}
export declare function createJaitTool(deps: JaitToolDeps): ToolDefinition<JaitInput>;
export {};
//# sourceMappingURL=jait.d.ts.map