import type { JaitDB } from "../db/index.js";
import type { ToolResult } from "../tools/contracts.js";
export interface SchedulerToolExecution {
    toolName: string;
    input: unknown;
    sessionId: string;
    workspaceRoot: string;
    userId?: string | null;
}
export interface SchedulerExecutionResult {
    jobId: string;
    actionId: string;
    result: ToolResult;
}
export interface ScheduledJobRecord {
    id: string;
    userId: string | null;
    name: string;
    cron: string;
    toolName: string;
    input: unknown;
    sessionId: string;
    workspaceRoot: string;
    enabled: boolean;
    lastRunAt: string | null;
    createdAt: string;
    updatedAt: string;
}
interface SchedulerOptions {
    db: JaitDB;
    executeTool: (execution: SchedulerToolExecution) => Promise<ToolResult>;
    onExecuted?: (result: SchedulerExecutionResult) => void;
}
export declare class SchedulerService {
    private options;
    private timer;
    private ticking;
    constructor(options: SchedulerOptions);
    start(pollMs?: number): void;
    stop(): void;
    list(userId?: string): ScheduledJobRecord[];
    create(params: {
        userId?: string;
        name: string;
        cron: string;
        toolName: string;
        input?: unknown;
        sessionId?: string;
        workspaceRoot?: string;
        enabled?: boolean;
    }): ScheduledJobRecord;
    get(id: string, userId?: string): ScheduledJobRecord | null;
    remove(id: string, userId?: string): boolean;
    update(id: string, patch: {
        name?: string;
        cron?: string;
        toolName?: string;
        enabled?: boolean;
        input?: unknown;
    }, userId?: string): ScheduledJobRecord | null;
    trigger(id: string, userId?: string, runAt?: Date): Promise<SchedulerExecutionResult>;
    tick(now?: Date): Promise<void>;
}
export {};
//# sourceMappingURL=service.d.ts.map