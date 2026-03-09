/**
 * Lightweight token estimation — no external tokenizer dependency.
 *
 * Uses a char/token ratio of ~3.7 (empirically close to GPT-4 BPE for
 * mixed English text + code). JSON overhead is slightly higher (~4.0)
 * so we use that for structured payloads.
 */
const TEXT_CHARS_PER_TOKEN = 3.7;
const JSON_CHARS_PER_TOKEN = 4.0;
/** Estimate tokens for a plain-text string. */
export function estimateTokens(text) {
    if (!text)
        return 0;
    return Math.ceil(text.length / TEXT_CHARS_PER_TOKEN);
}
/** Estimate tokens for a JSON-stringified payload. */
export function estimateJsonTokens(obj) {
    const json = typeof obj === "string" ? obj : JSON.stringify(obj);
    return Math.ceil(json.length / JSON_CHARS_PER_TOKEN);
}
/**
 * Per-message overhead: ~4 tokens for role/formatting delimiters
 * (matches OpenAI's documented `tokens_per_message` for gpt-4).
 */
const TOKENS_PER_MESSAGE = 4;
/** Estimate token cost of a single chat message. */
export function estimateMessageTokens(msg) {
    let tokens = TOKENS_PER_MESSAGE;
    tokens += estimateTokens(msg.content);
    if (msg.name)
        tokens += estimateTokens(msg.name);
    if (msg.tool_call_id)
        tokens += estimateTokens(msg.tool_call_id);
    if (msg.tool_calls) {
        // Tool calls are JSON-heavy
        tokens += estimateJsonTokens(msg.tool_calls);
    }
    return tokens;
}
/** Estimate total token cost of a message array. */
export function estimateHistoryTokens(messages) {
    let total = 3; // every request has ~3 priming tokens
    for (const msg of messages) {
        total += estimateMessageTokens(msg);
    }
    return total;
}
/** Estimate token cost of tool schemas. */
export function estimateToolSchemaTokens(schemas) {
    if (!schemas.length)
        return 0;
    // Tool schemas get ~16 base + 8 per tool + schema content
    let tokens = 16;
    for (const schema of schemas) {
        tokens += 8 + estimateJsonTokens(schema);
    }
    // Apply 1.1× safety margin (same as Copilot)
    return Math.ceil(tokens * 1.1);
}
/** Compute context usage breakdown from current state. */
export function computeContextUsage(messages, toolSchemas, contextWindow) {
    let system = 0;
    let history = 0;
    let toolResults = 0;
    for (const msg of messages) {
        const cost = estimateMessageTokens(msg);
        if (msg.role === "system") {
            system += cost;
        }
        else if (msg.role === "tool") {
            toolResults += cost;
        }
        else {
            history += cost;
        }
    }
    const tools = estimateToolSchemaTokens(toolSchemas);
    const total = system + history + toolResults + tools;
    const ratio = contextWindow > 0 ? Math.min(total / contextWindow, 1.0) : 0;
    return { system, history, toolResults, tools, total, limit: contextWindow, ratio };
}
//# sourceMappingURL=token-estimator.js.map