import type { ProviderId } from "../providers/contracts.js";
import type { ProviderRegistry } from "../providers/registry.js";
import { type GitStackedAction, type GitStepResult } from "../services/git.js";
import type { ThreadService } from "../services/threads.js";
import type { WsControlPlane } from "../ws.js";
import type { ToolDefinition } from "./contracts.js";
interface ThreadControlInput {
    action: "list" | "get" | "create" | "create_many" | "update" | "delete" | "start" | "send" | "stop" | "interrupt" | "approve" | "activities" | "create_pr";
    threadId?: string;
    sessionId?: string;
    title?: string;
    providerId?: ProviderId;
    model?: string;
    runtimeMode?: "full-access" | "supervised";
    workingDirectory?: string;
    branch?: string;
    message?: string;
    attachments?: string[];
    start?: boolean;
    threads?: ThreadCreateSpec[];
    requestId?: string;
    approved?: boolean;
    limit?: number;
    prUrl?: string | null;
    prNumber?: number | null;
    prTitle?: string | null;
    prState?: "open" | "closed" | "merged" | null;
    cwd?: string;
    gitAction?: GitStackedAction;
    commitMessage?: string;
    baseBranch?: string;
    featureBranch?: boolean;
}
interface ThreadCreateSpec {
    title: string;
    providerId?: ProviderId;
    model?: string;
    runtimeMode?: "full-access" | "supervised";
    workingDirectory?: string;
    branch?: string;
    sessionId?: string;
    start?: boolean;
    message?: string;
    attachments?: string[];
}
interface ThreadControlGit {
    runStackedAction(cwd: string, action: GitStackedAction, commitMessage?: string, featureBranch?: boolean, baseBranch?: string, githubToken?: string): Promise<GitStepResult>;
}
export interface ThreadControlToolDeps {
    threadService: ThreadService;
    providerRegistry: ProviderRegistry;
    ws?: WsControlPlane;
    mcpConfig?: {
        host: string;
        port: number;
    };
    gitService?: ThreadControlGit;
}
export declare function createThreadControlTool(deps: ThreadControlToolDeps): ToolDefinition<ThreadControlInput>;
export {};
//# sourceMappingURL=thread-tools.d.ts.map