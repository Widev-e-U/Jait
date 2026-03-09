/**
 * Lightweight token estimation — no external tokenizer dependency.
 *
 * Uses a char/token ratio of ~3.7 (empirically close to GPT-4 BPE for
 * mixed English text + code). JSON overhead is slightly higher (~4.0)
 * so we use that for structured payloads.
 */
/** Estimate tokens for a plain-text string. */
export declare function estimateTokens(text: string): number;
/** Estimate tokens for a JSON-stringified payload. */
export declare function estimateJsonTokens(obj: unknown): number;
/** Estimate token cost of a single chat message. */
export declare function estimateMessageTokens(msg: {
    role: string;
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
    name?: string;
}): number;
/** Estimate total token cost of a message array. */
export declare function estimateHistoryTokens(messages: Array<{
    role: string;
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
    name?: string;
}>): number;
/** Estimate token cost of tool schemas. */
export declare function estimateToolSchemaTokens(schemas: unknown[]): number;
/** Context usage breakdown by category. */
export interface ContextUsage {
    /** System prompt tokens */
    system: number;
    /** Conversation history (user + assistant messages) */
    history: number;
    /** Tool call results */
    toolResults: number;
    /** Tool schema definitions */
    tools: number;
    /** Total tokens used */
    total: number;
    /** Context window limit */
    limit: number;
    /** Usage ratio 0.0–1.0 */
    ratio: number;
}
/** Compute context usage breakdown from current state. */
export declare function computeContextUsage(messages: Array<{
    role: string;
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
    name?: string;
}>, toolSchemas: unknown[], contextWindow: number): ContextUsage;
//# sourceMappingURL=token-estimator.d.ts.map