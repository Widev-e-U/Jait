/**
 * ThreadService — CRUD + lifecycle management for agent threads.
 *
 * Agent threads are parallel running agent sessions, each powered by a
 * CliProviderAdapter (jait, codex, or claude-code). Threads persist their
 * status, configuration, and activity log in SQLite via Drizzle.
 */
import type { JaitDB } from "../db/connection.js";
import { agentThreads } from "../db/schema.js";
import type { ProviderId, RuntimeMode, ProviderEvent } from "../providers/contracts.js";
export type ThreadStatus = "running" | "completed" | "error" | "interrupted";
export interface CreateThreadParams {
    userId?: string;
    sessionId?: string;
    title: string;
    providerId: ProviderId;
    model?: string;
    runtimeMode?: RuntimeMode;
    workingDirectory?: string;
    branch?: string;
}
export interface UpdateThreadParams {
    title?: string;
    model?: string;
    runtimeMode?: RuntimeMode;
    workingDirectory?: string;
    branch?: string;
    prUrl?: string | null;
    prNumber?: number | null;
    prTitle?: string | null;
    prState?: "open" | "closed" | "merged" | null;
    status?: ThreadStatus;
    providerSessionId?: string | null;
    error?: string | null;
    completedAt?: string | null;
}
export interface ThreadActivity {
    id: string;
    threadId: string;
    kind: string;
    summary: string;
    payload?: unknown;
    createdAt: string;
}
export type ThreadRow = typeof agentThreads.$inferSelect;
export declare class ThreadService {
    private db;
    constructor(db: JaitDB);
    create(params: CreateThreadParams): ThreadRow;
    getById(id: string): ThreadRow | undefined;
    list(userId?: string): ThreadRow[];
    listBySession(sessionId: string): ThreadRow[];
    listRunning(): ThreadRow[];
    update(id: string, params: UpdateThreadParams): ThreadRow | undefined;
    delete(id: string): void;
    markRunning(id: string, providerSessionId: string): ThreadRow | undefined;
    markCompleted(id: string): ThreadRow | undefined;
    markError(id: string, error: string): ThreadRow | undefined;
    markInterrupted(id: string): ThreadRow | undefined;
    addActivity(threadId: string, kind: string, summary: string, payload?: unknown): ThreadActivity;
    getActivities(threadId: string, limit?: number, after?: string): ThreadActivity[];
    logProviderEvent(threadId: string, event: ProviderEvent): ThreadActivity | undefined;
}
//# sourceMappingURL=threads.d.ts.map