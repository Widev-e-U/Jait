/**
 * Consent-Aware Tool Executor — Sprint 4.7
 *
 * Wraps ToolRegistry.execute() with consent checking. When a tool requires
 * consent (based on permissions + trust level), execution is paused and a
 * consent request is created. The tool only runs after approval.
 *
 * In dry-run mode, the executor returns the plan (what would happen)
 * without executing anything, regardless of consent level.
 */
import type { ToolContext, ToolResult } from "../tools/contracts.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { AuditWriter } from "../services/audit.js";
import type { ConsentManager } from "./consent-manager.js";
import type { TrustEngine } from "./trust-engine.js";
import type { ToolPermission } from "./tool-permissions.js";
export interface ConsentAwareExecutorOptions {
    toolRegistry: ToolRegistry;
    consentManager: ConsentManager;
    trustEngine: TrustEngine;
    audit?: AuditWriter;
    /** Permission map: toolName -> ToolPermission */
    permissions: Map<string, ToolPermission>;
    /** Session-scoped set of tools approved via "once" */
    sessionApprovals: Set<string>;
}
export interface ExecuteOptions {
    /** If true, return the plan without executing */
    dryRun?: boolean;
    /** Consent timeout override (ms) */
    consentTimeoutMs?: number;
}
export declare class ConsentAwareExecutor {
    private readonly toolRegistry;
    private readonly consentManager;
    private readonly trustEngine;
    private readonly audit?;
    private readonly permissions;
    private readonly sessionApprovals;
    constructor(opts: ConsentAwareExecutorOptions);
    /**
     * Execute a tool with consent checking and trust-level awareness.
     */
    execute(toolName: string, input: unknown, context: ToolContext, options?: ExecuteOptions): Promise<ToolResult>;
    private buildSummary;
    private buildPreview;
}
//# sourceMappingURL=consent-executor.d.ts.map