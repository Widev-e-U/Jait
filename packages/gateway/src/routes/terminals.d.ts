/**
 * Terminal Routes — Sprint 3.5
 *
 * REST + WebSocket endpoints for terminal interaction.
 */
import type { FastifyInstance } from "fastify";
import type { SurfaceRegistry } from "../surfaces/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolContext, ToolResult } from "../tools/contracts.js";
import type { AuditWriter } from "../services/audit.js";
export declare function registerTerminalRoutes(app: FastifyInstance, surfaceRegistry: SurfaceRegistry, toolRegistry: ToolRegistry, audit: AuditWriter, toolExecutor?: (toolName: string, input: unknown, context: ToolContext, options?: {
    dryRun?: boolean;
    consentTimeoutMs?: number;
}) => Promise<ToolResult>): void;
//# sourceMappingURL=terminals.d.ts.map