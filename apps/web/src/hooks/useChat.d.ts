import type { ToolCallInfo } from '@/components/chat/tool-call-card';
import type { ChangedFile } from '@/components/chat/files-changed';
/**
 * A segment in the ordered response stream. Consecutive tool calls
 * are grouped; text between tool-call groups forms its own segment.
 */
export type MessageSegment = {
    type: 'text';
    content: string;
} | {
    type: 'toolGroup';
    callIds: string[];
};
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    /** Clean display text for user messages (without appended file contents) */
    displayContent?: string;
    /** File references attached by the user (shown as chips in the bubble) */
    referencedFiles?: {
        path: string;
        name: string;
    }[];
    thinking?: string;
    thinkingDuration?: number;
    toolCalls?: ToolCallInfo[];
    /**
     * Ordered interleaving of text and tool-call groups.
     * Present on messages built from a live stream; absent on
     * historical snapshots (renderer falls back to old layout).
     */
    segments?: MessageSegment[];
}
export type ChatMode = 'ask' | 'agent' | 'plan';
/** Context window usage breakdown from the gateway */
export interface ContextUsage {
    system: number;
    history: number;
    toolResults: number;
    tools: number;
    total: number;
    limit: number;
    ratio: number;
    pruned?: boolean;
}
export interface PlanAction {
    id: string;
    tool: string;
    args: unknown;
    description: string;
    order: number;
    status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
    result?: {
        ok: boolean;
        message: string;
        data?: unknown;
    };
}
export interface PlanData {
    plan_id: string;
    summary: string;
    actions: PlanAction[];
}
interface SendMessageOptions {
    token?: string | null;
    sessionId?: string | null;
    onLoginRequired?: () => void;
    mode?: ChatMode;
    /** CLI provider to use for this message (jait, codex, claude-code) */
    provider?: string;
    /** Model override for CLI providers */
    model?: string | null;
    /** Clean display text for user message (without file contents appended) */
    displayContent?: string;
    /** File references to attach as metadata on the user message */
    referencedFiles?: {
        path: string;
        name: string;
    }[];
}
/**
 * @param sessionId - externally managed session ID (from useSessions)
 */
export declare function useChat(sessionId: string | null, authToken?: string | null, onLoginRequired?: () => void): {
    messages: ChatMessage[];
    isLoading: boolean;
    isLoadingHistory: boolean;
    remainingPrompts: number | null;
    error: string | null;
    hitMaxRounds: boolean;
    pendingPlan: PlanData | null;
    todoList: TodoItem[];
    changedFiles: ChangedFile[];
    messageQueue: QueuedMessage[];
    contextUsage: ContextUsage | null;
    sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
    restartFromMessage: (messageId: string, editedContent: string, messageIndex?: number, messageFromEnd?: number, options?: SendMessageOptions) => Promise<void>;
    cancelRequest: () => void;
    clearMessages: () => void;
    continueChat: (options?: SendMessageOptions) => Promise<void>;
    executePlan: (actionIds?: string[]) => Promise<void>;
    rejectPlan: () => Promise<void>;
    enqueueMessage: (content: string) => void;
    dequeueMessage: (id: string) => void;
    updateQueueItem: (id: string, content: string) => void;
    acceptFile: (path: string) => Promise<void>;
    rejectFile: (path: string) => Promise<void>;
    acceptAllFiles: () => void;
    rejectAllFiles: () => Promise<void>;
    setTodoList: import("react").Dispatch<import("react").SetStateAction<TodoItem[]>>;
    addChangedFile: (path: string, name: string) => void;
    setChangedFiles: import("react").Dispatch<import("react").SetStateAction<ChangedFile[]>>;
    setOnChangedFilesSync: (cb: ((files: ChangedFile[]) => void) | null) => void;
    refreshMessages: () => void;
};
export {};
//# sourceMappingURL=useChat.d.ts.map