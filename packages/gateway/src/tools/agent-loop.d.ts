/**
 * Agent Loop — reusable, streamable tool-calling loop.
 *
 * Extracted from chat.ts and enhanced with:
 *  - Input validation (catches bad LLM args immediately)
 *  - Parallel tool execution (independent calls run concurrently)
 *  - Retry for individual failed tool calls
 *  - Steering (inject guidance mid-loop)
 *  - Tool call queueing with priority
 *
 * Both the main chat route and the agent.spawn sub-agent tool use this.
 */
import type { ToolResult } from "./contracts.js";
import type { ToolRegistry } from "./registry.js";
import { type ChatMode, type PlannedAction } from "./chat-modes.js";
/** Wire format for a single OpenAI tool call */
export interface OpenAIToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
}
/** A chat message in the conversation history */
export interface AgentMessage {
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    tool_calls?: OpenAIToolCall[];
    tool_call_id?: string;
    name?: string;
}
/** Segment for interleaved rendering of text and tool calls */
export type MessageSegment = {
    type: "text";
    content: string;
} | {
    type: "toolGroup";
    callIds: string[];
};
/** OpenAI function-calling tool schema */
export interface OpenAIToolSchema {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: unknown;
    };
}
/** LLM connection config */
export interface LLMConfig {
    openaiApiKey: string;
    openaiBaseUrl: string;
    openaiModel: string;
    /** Max context window in tokens */
    contextWindow: number;
}
/** Persisted record of a tool call execution */
export interface ExecutedToolCall {
    callId: string;
    tool: string;
    args: unknown;
    ok: boolean;
    message: string;
    data?: unknown;
    startedAt: number;
    completedAt: number;
    /** Number of times this call was retried */
    retryCount?: number;
}
/** Events emitted during the loop */
export type AgentLoopEvent = {
    type: "token";
    content: string;
} | {
    type: "tool_call_delta";
    call_id: string;
    index: number;
    name_delta?: string;
    args_delta?: string;
} | {
    type: "tool_start";
    tool: string;
    args: unknown;
    call_id: string;
} | {
    type: "tool_output";
    call_id: string;
    content: string;
} | {
    type: "tool_result";
    call_id: string;
    tool: string;
    ok: boolean;
    message: string;
    data?: unknown;
} | {
    type: "tool_retry";
    call_id: string;
    attempt: number;
    maxAttempts: number;
} | {
    type: "tool_validation_error";
    call_id: string;
    tool: string;
    errors: string[];
} | {
    type: "steering";
    message: string;
} | {
    type: "plan_action";
    action: PlannedAction;
} | {
    type: "plan_complete";
    planId: string;
    summary: string;
    actions: PlannedAction[];
} | {
    type: "mode_notice";
    mode: ChatMode;
    message: string;
} | {
    type: "todo_list";
    items: {
        id: number;
        title: string;
        status: "not-started" | "in-progress" | "completed";
    }[];
} | {
    type: "context_usage";
    system: number;
    history: number;
    toolResults: number;
    tools: number;
    total: number;
    limit: number;
    ratio: number;
    pruned?: boolean;
} | {
    type: "error";
    message: string;
};
/** Priority levels for queued tool calls */
export declare enum ToolCallPriority {
    /** Run before anything else (e.g. abort-checks, validation) */
    Critical = 0,
    /** Normal tool calls from the LLM */
    Normal = 1,
    /** Deferred / low-priority background work */
    Low = 2
}
/** A queued tool call entry */
export interface QueuedToolCall {
    toolCall: OpenAIToolCall;
    priority: ToolCallPriority;
    /** If true, this call can run in parallel with other parallel-safe calls */
    parallelSafe: boolean;
}
/** Options for the agent loop */
export interface AgentLoopOptions {
    /** LLM connection settings */
    llm: LLMConfig;
    /** The conversation history (mutated in place) */
    history: AgentMessage[];
    /** OpenAI tool schemas to send to the model */
    toolSchemas: OpenAIToolSchema[];
    /** Whether tools are available */
    hasTools: boolean;
    /** Session identifier (for logging / events) */
    sessionId: string;
    /** Auth context for tool execution */
    auth?: {
        userId?: string;
        apiKeys?: Record<string, string>;
    };
    /** Abort controller — abort to cancel the loop */
    abort: AbortController;
    /** Max tool-calling rounds before stopping */
    maxRounds?: number;
    /** Max retries per individual tool call failure (0 = no retry) */
    maxRetries?: number;
    /** Enable parallel execution of independent tool calls */
    parallel?: boolean;
    /** Tool registry for input validation (optional — skips validation if absent) */
    toolRegistry?: ToolRegistry;
    /** Optional filter: only allow these tool names (for sub-agents) */
    allowedTools?: Set<string>;
    /** User-disabled tools (never sent to LLM, never executed) */
    disabledTools?: Set<string>;
    /** Chat mode: ask (read-only), agent (full), or plan (propose then execute) */
    mode?: ChatMode;
    /** Logger (defaults to console) */
    log?: Logger;
    /** Event callback — called for every stream event */
    onEvent?: (event: AgentLoopEvent) => void;
    /** Persistence callback — called when a final assistant message should be saved */
    onPersist?: (sessionId: string, role: string, content: string, toolCalls?: string, segments?: string) => void;
}
export interface AgentLoopResult {
    content: string;
    executedToolCalls: ExecutedToolCall[];
    /** Interleaved text/toolGroup segments for rendering */
    segments: MessageSegment[];
    /** Total LLM rounds used */
    rounds: number;
    /** Whether the loop was stopped by abort */
    aborted: boolean;
    /** Whether the loop was stopped because it hit the max rounds limit */
    hitMaxRounds: boolean;
    /** Plan data — only populated in plan mode */
    plan?: {
        id: string;
        summary: string;
        actions: PlannedAction[];
    };
}
export interface Logger {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string | unknown, ...args: unknown[]): void;
}
/**
 * Steering lets the user (or system) inject guidance into the agent
 * loop while it's running. The steered message gets appended to the
 * conversation as a system message before the next LLM call.
 */
export declare class SteeringController {
    private queue;
    /** Inject a steering message into the loop */
    steer(message: string): void;
    /** Drain all pending steering messages (called by the loop) */
    drain(): string[];
    get hasPending(): boolean;
}
/**
 * Priority queue for tool calls. Sorts by priority (lower = first),
 * then partitions into parallel-safe batches.
 */
export declare class ToolCallQueue {
    private items;
    /** Enqueue a tool call with optional priority and parallelism hint */
    enqueue(toolCall: OpenAIToolCall, priority?: ToolCallPriority, parallelSafe?: boolean): void;
    /** Enqueue multiple tool calls at the same priority */
    enqueueAll(toolCalls: OpenAIToolCall[], priority?: ToolCallPriority, parallelSafe?: boolean): void;
    /**
     * Dequeue the next batch. If parallel execution is enabled, returns
     * all contiguous parallel-safe items at the same priority level.
     * Otherwise returns one at a time.
     */
    dequeueBatch(allowParallel: boolean): QueuedToolCall[];
    get length(): number;
    get isEmpty(): boolean;
}
/** OpenAI requires function names to match ^[a-zA-Z0-9_-]+$ — no dots */
export declare function toOpenAIName(name: string): string;
export declare function fromOpenAIName(name: string): string;
export declare function serializeMessages(messages: AgentMessage[]): Record<string, unknown>[];
export declare function buildToolSchemas(registry: ToolRegistry, allowedTools?: Set<string>): OpenAIToolSchema[];
/**
 * Build schemas respecting tiers and user disabled tools.
 *
 * Only "core" and "standard" (non-disabled) tools are included in the
 * initial payload. External / MCP tools must be discovered via tools.search.
 */
export declare function buildTieredToolSchemas(registry: ToolRegistry, disabledTools?: Set<string>): OpenAIToolSchema[];
/**
 * Convert individual tool definitions into OpenAI schemas.
 * Used to dynamically inject schemas discovered via tools.search.
 */
export declare function toolDefsToSchemas(defs: Array<{
    name: string;
    description: string;
    parameters: unknown;
}>): OpenAIToolSchema[];
interface ParsedStream {
    contentText: string;
    toolCalls: OpenAIToolCall[];
    finishReason: string | null;
}
export declare function parseOpenAIStream(reader: ReadableStreamDefaultReader<Uint8Array>, onEvent?: (event: AgentLoopEvent) => void): Promise<ParsedStream>;
export type ToolExecutor = (name: string, args: unknown, sessionId: string, auth?: {
    userId?: string;
    apiKeys?: Record<string, string>;
}, onChunk?: (chunk: string) => void, signal?: AbortSignal) => Promise<ToolResult>;
export declare function runAgentLoop(options: AgentLoopOptions, executeTool: ToolExecutor, steering?: SteeringController): Promise<AgentLoopResult>;
/**
 * Retry a specific failed tool call by its callId.
 *
 * This re-executes the tool with its original arguments, updates the
 * conversation history in-place (replaces the old tool result message),
 * and returns the new result.
 *
 * Designed to be called from a REST endpoint like:
 *   POST /api/sessions/:sessionId/retry-tool
 *   { callId: "call_abc123" }
 */
export declare function retryToolCall(callId: string, history: AgentMessage[], executedToolCalls: ExecutedToolCall[], executeTool: ToolExecutor, sessionId: string, auth?: {
    userId?: string;
    apiKeys?: Record<string, string>;
}, onEvent?: (event: AgentLoopEvent) => void, signal?: AbortSignal): Promise<ToolResult>;
export {};
//# sourceMappingURL=agent-loop.d.ts.map