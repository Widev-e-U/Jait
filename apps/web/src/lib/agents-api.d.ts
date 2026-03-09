/**
 * API client for agent threads and providers.
 */
import type { GitStepResult } from './git-api';
export type ProviderId = 'jait' | 'codex' | 'claude-code';
export type ThreadStatus = 'running' | 'completed' | 'error' | 'interrupted';
export type RuntimeMode = 'full-access' | 'supervised';
export interface AgentThread {
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
    prState: 'open' | 'closed' | 'merged' | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
}
export interface ThreadActivity {
    id: string;
    threadId: string;
    kind: string;
    summary: string;
    payload?: unknown;
    createdAt: string;
}
export interface ProviderInfo {
    id: ProviderId;
    name: string;
    description: string;
    available: boolean;
    unavailableReason?: string;
    modes: RuntimeMode[];
}
export interface CreateThreadRequest {
    sessionId?: string;
    title: string;
    providerId: ProviderId;
    model?: string;
    runtimeMode?: RuntimeMode;
    workingDirectory?: string;
    branch?: string;
}
export interface UpdateThreadRequest {
    title?: string;
    model?: string;
    runtimeMode?: RuntimeMode;
    workingDirectory?: string;
    branch?: string;
    prUrl?: string | null;
    prNumber?: number | null;
    prTitle?: string | null;
    prState?: 'open' | 'closed' | 'merged' | null;
}
export interface StartThreadOptions {
    message?: string;
    titlePrefix?: string;
    titleTask?: string;
}
export interface CreateThreadPrRequest {
    commitMessage?: string;
    baseBranch?: string;
}
export interface CreateThreadPrResponse {
    message: string;
    prUrl: string | null;
    result: GitStepResult;
    thread?: AgentThread;
}
export interface AutomationRepo {
    id: string;
    userId: string | null;
    deviceId: string | null;
    name: string;
    defaultBranch: string;
    localPath: string;
    createdAt: string;
    updatedAt: string;
}
export interface CreateRepoRequest {
    name: string;
    defaultBranch?: string;
    localPath: string;
    deviceId?: string;
}
export interface UpdateRepoRequest {
    name?: string;
    defaultBranch?: string;
    localPath?: string;
}
export declare class AgentsApi {
    private getToken;
    private getHeaders;
    listProviders(): Promise<ProviderInfo[]>;
    listProviderModels(providerId: ProviderId): Promise<{
        id: string;
        name: string;
        description?: string;
        isDefault?: boolean;
    }[]>;
    listThreads(sessionId?: string): Promise<AgentThread[]>;
    getThread(id: string): Promise<AgentThread>;
    createThread(params: CreateThreadRequest): Promise<AgentThread>;
    updateThread(id: string, params: UpdateThreadRequest): Promise<AgentThread>;
    deleteThread(id: string): Promise<void>;
    startThread(id: string, options?: string | StartThreadOptions): Promise<AgentThread>;
    sendTurn(id: string, message: string): Promise<void>;
    stopThread(id: string): Promise<void>;
    interruptThread(id: string): Promise<void>;
    approveToolCall(id: string, requestId: string, approved: boolean): Promise<void>;
    createPullRequest(id: string, params: CreateThreadPrRequest): Promise<CreateThreadPrResponse>;
    getActivities(threadId: string, limit?: number): Promise<ThreadActivity[]>;
    listRepos(): Promise<AutomationRepo[]>;
    createRepo(params: CreateRepoRequest): Promise<AutomationRepo>;
    updateRepo(id: string, params: UpdateRepoRequest): Promise<AutomationRepo>;
    deleteRepo(id: string): Promise<void>;
}
export declare const agentsApi: AgentsApi;
//# sourceMappingURL=agents-api.d.ts.map