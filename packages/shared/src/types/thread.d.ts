/**
 * Shared types for agent threads and CLI providers.
 *
 * These types are consumed by both the gateway (backend) and
 * the web app (frontend) for the parallel-agents UI.
 */
export type ProviderId = "jait" | "codex" | "claude-code";
export interface ProviderInfo {
    id: ProviderId;
    name: string;
    description: string;
    available: boolean;
    unavailableReason?: string;
    modes: RuntimeMode[];
}
export type RuntimeMode = "full-access" | "supervised";
export type ThreadStatus = "running" | "completed" | "error" | "interrupted";
export interface ThreadInfo {
    id: string;
    userId: string | null;
    sessionId: string | null;
    title: string;
    providerId: ProviderId;
    model: string | null;
    runtimeMode: RuntimeMode;
    workingDirectory: string | null;
    branch: string | null;
    status: ThreadStatus;
    providerSessionId: string | null;
    error: string | null;
    prUrl: string | null;
    prNumber: number | null;
    prTitle: string | null;
    prState: "open" | "closed" | "merged" | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
}
export type ThreadActivityKind = "tool.start" | "tool.result" | "tool.error" | "tool.approval" | "message" | "error" | "session" | "activity";
export interface ThreadActivity {
    id: string;
    threadId: string;
    kind: string;
    summary: string;
    payload?: unknown;
    createdAt: string;
}
export interface CreateThreadParams {
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
}
export type ThreadWsEventType = "thread.created" | "thread.updated" | "thread.deleted" | "thread.status" | "thread.activity";
export interface ThreadWsEvent {
    type: ThreadWsEventType;
    threadId: string;
    data: unknown;
}
//# sourceMappingURL=thread.d.ts.map