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
import { validateToolInput } from "./validate.js";
import { ASK_MODE_TOOLS, MUTATING_TOOLS } from "./chat-modes.js";
import { getReminderInstructions } from "./prompts/index.js";
import { computeContextUsage, estimateTokens } from "./token-estimator.js";
/** Format an LLM HTTP error into a user-friendly message, similar to VS Code Copilot. */
function formatLLMError(status, responseText) {
    let parsed;
    try {
        parsed = JSON.parse(responseText);
    }
    catch { /* not JSON */ }
    const serverMsg = parsed?.error?.message;
    const code = parsed?.error?.code;
    switch (status) {
        case 401:
            return "Your API key is invalid or expired. Please check your settings.";
        case 403:
            return "Access denied by the model provider. Please check your API key permissions.";
        case 429:
            if (code === "insufficient_quota" || serverMsg?.includes("quota"))
                return "You've exceeded your API quota. Please check your plan and billing details.";
            return `Rate limited by the model provider. Please wait a moment and try again.${serverMsg ? `\n${serverMsg}` : ""}`;
        case 500:
        case 502:
        case 503:
            return `The model provider is experiencing issues (${status}). Please try again later.`;
        default:
            return serverMsg
                ? `Request failed (${status}): ${serverMsg}`
                : `Request failed with status ${status}. Please try again.`;
    }
}
/** Priority levels for queued tool calls */
export var ToolCallPriority;
(function (ToolCallPriority) {
    /** Run before anything else (e.g. abort-checks, validation) */
    ToolCallPriority[ToolCallPriority["Critical"] = 0] = "Critical";
    /** Normal tool calls from the LLM */
    ToolCallPriority[ToolCallPriority["Normal"] = 1] = "Normal";
    /** Deferred / low-priority background work */
    ToolCallPriority[ToolCallPriority["Low"] = 2] = "Low";
})(ToolCallPriority || (ToolCallPriority = {}));
// ── Steering controller ──────────────────────────────────────────────
/**
 * Steering lets the user (or system) inject guidance into the agent
 * loop while it's running. The steered message gets appended to the
 * conversation as a system message before the next LLM call.
 */
export class SteeringController {
    queue = [];
    /** Inject a steering message into the loop */
    steer(message) {
        this.queue.push(message);
    }
    /** Drain all pending steering messages (called by the loop) */
    drain() {
        const msgs = this.queue.splice(0);
        return msgs;
    }
    get hasPending() {
        return this.queue.length > 0;
    }
}
// ── Tool call queue ──────────────────────────────────────────────────
/**
 * Priority queue for tool calls. Sorts by priority (lower = first),
 * then partitions into parallel-safe batches.
 */
export class ToolCallQueue {
    items = [];
    /** Enqueue a tool call with optional priority and parallelism hint */
    enqueue(toolCall, priority = ToolCallPriority.Normal, parallelSafe = false) {
        this.items.push({ toolCall, priority, parallelSafe });
        // Keep sorted by priority
        this.items.sort((a, b) => a.priority - b.priority);
    }
    /** Enqueue multiple tool calls at the same priority */
    enqueueAll(toolCalls, priority = ToolCallPriority.Normal, parallelSafe = false) {
        for (const tc of toolCalls) {
            this.enqueue(tc, priority, parallelSafe);
        }
    }
    /**
     * Dequeue the next batch. If parallel execution is enabled, returns
     * all contiguous parallel-safe items at the same priority level.
     * Otherwise returns one at a time.
     */
    dequeueBatch(allowParallel) {
        if (this.items.length === 0)
            return [];
        if (!allowParallel) {
            return [this.items.shift()];
        }
        const first = this.items[0];
        if (!first.parallelSafe) {
            return [this.items.shift()];
        }
        // Grab all contiguous items at the same priority that are parallel-safe
        const batch = [];
        while (this.items.length > 0 &&
            this.items[0].priority === first.priority &&
            this.items[0].parallelSafe) {
            batch.push(this.items.shift());
        }
        return batch;
    }
    get length() {
        return this.items.length;
    }
    get isEmpty() {
        return this.items.length === 0;
    }
}
// ── Tool name conversion ─────────────────────────────────────────────
/** OpenAI requires function names to match ^[a-zA-Z0-9_-]+$ — no dots */
export function toOpenAIName(name) {
    return name.replace(/\./g, "_");
}
export function fromOpenAIName(name) {
    const idx = name.indexOf("_");
    if (idx === -1)
        return name;
    return name.slice(0, idx) + "." + name.slice(idx + 1);
}
// ── Tools that are safe to run in parallel ───────────────────────────
/**
 * Read-only / side-effect-free tools that can safely execute concurrently.
 * Tools NOT in this set run sequentially to preserve ordering guarantees.
 */
const PARALLEL_SAFE_TOOLS = new Set([
    "file.read",
    "file.list",
    "file.stat",
    "os.query",
    "memory.search",
    "web.fetch",
    "web.search",
    "gateway.status",
    "browser.snapshot",
]);
function isParallelSafe(toolName) {
    return PARALLEL_SAFE_TOOLS.has(toolName);
}
// ── Serialize messages for OpenAI API ────────────────────────────────
export function serializeMessages(messages) {
    return messages.map((m) => {
        const msg = { role: m.role, content: m.content };
        if (m.tool_calls)
            msg.tool_calls = m.tool_calls;
        if (m.tool_call_id)
            msg.tool_call_id = m.tool_call_id;
        if (m.name)
            msg.name = m.name;
        return msg;
    });
}
// ── Build OpenAI tool schemas ────────────────────────────────────────
export function buildToolSchemas(registry, allowedTools) {
    let tools = registry.list();
    if (allowedTools) {
        tools = tools.filter((t) => allowedTools.has(t.name));
    }
    return tools.map((t) => ({
        type: "function",
        function: {
            name: toOpenAIName(t.name),
            description: t.description,
            parameters: t.parameters,
        },
    }));
}
/**
 * Build schemas respecting tiers and user disabled tools.
 *
 * Only "core" and "standard" (non-disabled) tools are included in the
 * initial payload. External / MCP tools must be discovered via tools.search.
 */
export function buildTieredToolSchemas(registry, disabledTools) {
    const tools = registry.listForLLM(disabledTools);
    return tools.map((t) => ({
        type: "function",
        function: {
            name: toOpenAIName(t.name),
            description: t.description,
            parameters: t.parameters,
        },
    }));
}
/**
 * Convert individual tool definitions into OpenAI schemas.
 * Used to dynamically inject schemas discovered via tools.search.
 */
export function toolDefsToSchemas(defs) {
    return defs.map((t) => ({
        type: "function",
        function: {
            name: toOpenAIName(t.name),
            description: t.description,
            parameters: t.parameters,
        },
    }));
}
export async function parseOpenAIStream(reader, onEvent) {
    const decoder = new TextDecoder();
    let buffer = "";
    let contentText = "";
    let finishReason = null;
    const toolCallMap = new Map();
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: "))
                continue;
            const payload = trimmed.slice(6);
            if (payload === "[DONE]")
                continue;
            try {
                const chunk = JSON.parse(payload);
                const choice = chunk.choices?.[0];
                if (!choice)
                    continue;
                const delta = choice.delta;
                if (!delta)
                    continue;
                // Text content
                if (delta.content) {
                    contentText += delta.content;
                    onEvent?.({ type: "token", content: delta.content });
                }
                // Tool calls (streamed incrementally)
                if (delta.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index ?? 0;
                        const isNew = !toolCallMap.has(idx);
                        if (isNew) {
                            toolCallMap.set(idx, {
                                id: tc.id ?? "",
                                type: "function",
                                function: { name: tc.function?.name ?? "", arguments: "" },
                            });
                        }
                        const existing = toolCallMap.get(idx);
                        if (tc.id)
                            existing.id = tc.id;
                        if (!isNew && tc.function?.name)
                            existing.function.name += tc.function.name;
                        if (tc.function?.arguments)
                            existing.function.arguments += tc.function.arguments;
                        const callId = existing.id || `pending-${idx}`;
                        onEvent?.({
                            type: "tool_call_delta",
                            call_id: callId,
                            index: idx,
                            name_delta: tc.function?.name || undefined,
                            args_delta: tc.function?.arguments || undefined,
                        });
                    }
                }
                if (choice.finish_reason) {
                    finishReason = choice.finish_reason;
                }
            }
            catch {
                // partial JSON chunk — ignore
            }
        }
    }
    const toolCalls = [...toolCallMap.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, tc]) => tc);
    return { contentText, toolCalls, finishReason };
}
async function executeOneToolCall(opts) {
    const { tc, sessionId, auth, signal, toolRegistry, maxRetries, onEvent, executeTool } = opts;
    const startedAt = Date.now();
    let args;
    try {
        args = JSON.parse(tc.function.arguments);
    }
    catch {
        args = {};
    }
    const internalName = fromOpenAIName(tc.function.name);
    // ── Input validation (fast reject bad LLM args) ──
    if (toolRegistry) {
        const toolDef = toolRegistry.get(internalName);
        if (toolDef) {
            const validation = validateToolInput(toolDef.parameters, args);
            if (!validation.valid) {
                onEvent?.({
                    type: "tool_validation_error",
                    call_id: tc.id,
                    tool: internalName,
                    errors: validation.errors,
                });
                // Return the validation error as a tool result so the LLM can self-correct
                const errorMsg = `INPUT VALIDATION ERROR: ${validation.errors.join("; ")}`;
                const result = { ok: false, message: errorMsg };
                return {
                    result,
                    executed: {
                        callId: tc.id,
                        tool: internalName,
                        args,
                        ok: false,
                        message: errorMsg,
                        startedAt,
                        completedAt: Date.now(),
                        retryCount: 0,
                    },
                    historyEntry: {
                        role: "tool",
                        content: JSON.stringify({ ok: false, message: errorMsg }),
                        tool_call_id: tc.id,
                        name: tc.function.name,
                    },
                };
            }
        }
    }
    // ── Execute with retries ──
    onEvent?.({ type: "tool_start", tool: internalName, args, call_id: tc.id });
    let result = { ok: false, message: "Not executed" };
    let retryCount = 0;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (signal?.aborted) {
            result = { ok: false, message: "Cancelled" };
            break;
        }
        if (attempt > 0) {
            onEvent?.({ type: "tool_retry", call_id: tc.id, attempt, maxAttempts: maxRetries });
            // Exponential backoff: 500ms, 1s, 2s
            await new Promise((r) => setTimeout(r, Math.min(500 * 2 ** (attempt - 1), 4000)));
        }
        result = await executeTool(internalName, args, sessionId, auth, (chunk) => {
            onEvent?.({ type: "tool_output", call_id: tc.id, content: chunk });
        }, signal);
        if (result.ok)
            break;
        // Only retry transient failures, not logical errors
        if (!isTransientFailure(result.message))
            break;
        retryCount = attempt + 1;
    }
    const completedAt = Date.now();
    onEvent?.({
        type: "tool_result",
        call_id: tc.id,
        tool: internalName,
        ok: result.ok,
        message: result.message,
        data: result.data,
    });
    // If this was a todo tool call, emit todo_list event for the UI
    if (internalName === "todo" && result.ok && result.data) {
        const items = result.data.items;
        if (Array.isArray(items)) {
            onEvent?.({ type: "todo_list", items });
        }
    }
    // If this was a file-modifying tool, emit file_changed event for cross-client sync
    if (result.ok && (internalName === "file.write" || internalName === "file.patch" || internalName === "edit")) {
        const filePath = String(args?.path ?? "");
        if (filePath) {
            onEvent?.({
                type: "file_changed",
                path: filePath,
                name: filePath.split("/").pop() ?? filePath,
            });
        }
    }
    return {
        result,
        executed: {
            callId: tc.id,
            tool: internalName,
            args,
            ok: result.ok,
            message: result.message,
            data: result.data,
            startedAt,
            completedAt,
            retryCount,
        },
        historyEntry: {
            role: "tool",
            content: JSON.stringify({ ok: result.ok, message: result.message, data: result.data }),
            tool_call_id: tc.id,
            name: tc.function.name,
        },
    };
}
/** Heuristic: is this error transient and worth retrying? */
function isTransientFailure(message) {
    const lower = message.toLowerCase();
    return (lower.includes("timeout") ||
        lower.includes("econnrefused") ||
        lower.includes("econnreset") ||
        lower.includes("socket hang up") ||
        lower.includes("rate limit") ||
        lower.includes("429") ||
        lower.includes("503") ||
        lower.includes("502") ||
        lower.includes("network") ||
        lower.includes("unavailable"));
}
// ── Main agent loop ──────────────────────────────────────────────────
const DEFAULT_MAX_ROUNDS = 15;
const DEFAULT_MAX_RETRIES = 2;
/**
 * Run the agentic tool-calling loop.
 *
 * This is the core reusable loop used by both the main chat route and
 * the agent.spawn sub-agent tool. It streams LLM responses, executes
 * tool calls (with validation, retry, parallel batching, and steering),
 * and returns the accumulated result.
 */
// ── Context pruning ──────────────────────────────────────────────────
/** Target ratio after pruning — leave headroom for the next LLM response */
const PRUNE_TARGET_RATIO = 0.65;
/**
 * Prune oldest conversation turns to bring context usage below the target.
 *
 * Strategy (similar to Copilot):
 *  1. Never remove the system prompt (index 0) or the last user message.
 *  2. Remove oldest user/assistant/tool turn groups first.
 *  3. Insert a `[conversation-summary]` placeholder so the model knows
 *     context was trimmed.
 *
 * Mutates `history` in place. Returns true if anything was pruned.
 */
function pruneHistory(history, contextWindow, toolSchemas) {
    const usage = computeContextUsage(history, toolSchemas, contextWindow);
    const targetTokens = Math.floor(contextWindow * PRUNE_TARGET_RATIO);
    if (usage.total <= targetTokens)
        return false;
    let tokensToFree = usage.total - targetTokens;
    let pruned = false;
    // Find removable range: skip system messages at the start and keep
    // the last user message + everything after it.
    let firstRemovable = 0;
    while (firstRemovable < history.length && history[firstRemovable].role === "system") {
        firstRemovable++;
    }
    // Find last user message index
    let lastUserIdx = history.length - 1;
    while (lastUserIdx >= 0 && history[lastUserIdx].role !== "user") {
        lastUserIdx--;
    }
    // Keep the last user message and everything after it
    const safeEnd = Math.max(lastUserIdx, firstRemovable);
    // Remove messages from firstRemovable forward until we've freed enough
    const removedIndices = [];
    for (let i = firstRemovable; i < safeEnd && tokensToFree > 0; i++) {
        const msg = history[i];
        const cost = estimateTokens(msg.content) + 4; // rough per-message estimate
        if (msg.role === "tool" && msg.tool_calls) {
            // tool_calls are heavier
            try {
                tokensToFree -= estimateTokens(JSON.stringify(msg.tool_calls));
            }
            catch { /* */ }
        }
        tokensToFree -= cost;
        removedIndices.push(i);
        pruned = true;
    }
    if (removedIndices.length > 0) {
        // Remove in reverse order to keep indices stable
        for (let i = removedIndices.length - 1; i >= 0; i--) {
            history.splice(removedIndices[i], 1);
        }
        // Insert a summary placeholder after the system messages
        const insertAt = firstRemovable;
        history.splice(insertAt, 0, {
            role: "system",
            content: `[conversation-summary] ${removedIndices.length} earlier messages were removed to fit the context window. The conversation continues from the remaining messages below.`,
        });
    }
    return pruned;
}
export async function runAgentLoop(options, executeTool, steering) {
    const { llm, history, toolSchemas: initialToolSchemas, hasTools, sessionId, auth, abort, maxRounds = DEFAULT_MAX_ROUNDS, maxRetries = DEFAULT_MAX_RETRIES, parallel = true, toolRegistry, disabledTools, mode = "agent", onEvent, onPersist, log = console, } = options;
    let fullContent = "";
    const executedToolCalls = [];
    const segments = [];
    const queue = new ToolCallQueue();
    // ── Plan mode state ──
    const plannedActions = [];
    const planId = mode === "plan" ? `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : "";
    // ── Mode-aware schema filtering ──
    // Ask mode: only read-only tools. Plan/Agent mode: full set.
    let modeFilteredSchemas = initialToolSchemas;
    if (mode === "ask") {
        modeFilteredSchemas = initialToolSchemas.filter((s) => ASK_MODE_TOOLS.has(fromOpenAIName(s.function.name)));
        onEvent?.({ type: "mode_notice", mode: "ask", message: "Running in Ask mode — read-only tools only." });
    }
    else if (mode === "plan") {
        onEvent?.({ type: "mode_notice", mode: "plan", message: "Running in Plan mode — mutating actions will be proposed, not executed." });
    }
    // Dynamic schema set — starts with filtered schemas, grows when tools.search
    // discovers additional tools (e.g. external/MCP tools).
    const activeSchemas = [...modeFilteredSchemas];
    const activeSchemaNames = new Set(activeSchemas.map((s) => s.function.name));
    for (let round = 0; round < maxRounds; round++) {
        // ── Check abort ──
        if (abort.signal.aborted) {
            log.info(`Agent loop cancelled for session ${sessionId} — stopping before round ${round}`);
            return { content: fullContent, executedToolCalls, segments, rounds: round, aborted: true, hitMaxRounds: false };
        }
        // ── Apply steering messages ──
        if (steering) {
            const steered = steering.drain();
            for (const msg of steered) {
                history.push({ role: "system", content: `[STEERING] ${msg}` });
                onEvent?.({ type: "steering", message: msg });
                log.info(`Steering injected for session ${sessionId}: ${msg.slice(0, 100)}`);
            }
        }
        // ── Periodic reminder (every 4 rounds) to reinforce good agent behaviour ──
        if (round > 0 && round % 4 === 0 && mode !== "ask") {
            const modelEndpoint = { model: llm.openaiModel, baseUrl: "" };
            const reminder = getReminderInstructions(mode, modelEndpoint);
            if (reminder) {
                history.push({ role: "system", content: reminder });
            }
        }
        // ── Context budget tracking & pruning ──────────────────────────────
        const contextWindow = llm.contextWindow;
        if (contextWindow > 0) {
            let usage = computeContextUsage(history, activeSchemas, contextWindow);
            onEvent?.({ type: "context_usage", ...usage });
            // If context usage ≥ 85%, prune oldest conversation turns
            if (usage.ratio >= 0.85) {
                const pruned = pruneHistory(history, contextWindow, activeSchemas);
                if (pruned) {
                    usage = computeContextUsage(history, activeSchemas, contextWindow);
                    onEvent?.({ type: "context_usage", ...usage, pruned: true });
                    log.info(`Context pruned: ${usage.total}/${contextWindow} tokens (${(usage.ratio * 100).toFixed(0)}%)`);
                }
            }
        }
        // ── LLM request ──
        const reqBody = {
            model: llm.openaiModel,
            messages: serializeMessages(history),
            stream: true,
        };
        if (hasTools) {
            reqBody.tools = activeSchemas;
            reqBody.tool_choice = "auto";
        }
        let contentText = "";
        let toolCalls = [];
        let finishReason = null;
        try {
            const response = await fetch(`${llm.openaiBaseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${llm.openaiApiKey}`,
                },
                body: JSON.stringify(reqBody),
                signal: abort.signal,
            });
            if (!response.ok) {
                const errText = await response.text();
                log.error(`LLM error ${response.status}: ${errText}`);
                const friendlyMessage = formatLLMError(response.status, errText);
                onEvent?.({ type: "error", message: friendlyMessage });
                return { content: fullContent, executedToolCalls, segments, rounds: round + 1, aborted: false, hitMaxRounds: false };
            }
            const reader = response.body?.getReader();
            if (!reader) {
                onEvent?.({ type: "error", message: "No response body from LLM" });
                return { content: fullContent, executedToolCalls, segments, rounds: round + 1, aborted: false, hitMaxRounds: false };
            }
            const parsed = await parseOpenAIStream(reader, onEvent);
            contentText = parsed.contentText;
            toolCalls = parsed.toolCalls;
            finishReason = parsed.finishReason;
        }
        catch (fetchErr) {
            if (abort.signal.aborted) {
                log.info(`Agent loop cancelled during LLM streaming (round ${round})`);
                return { content: fullContent, executedToolCalls, segments, rounds: round + 1, aborted: true, hitMaxRounds: false };
            }
            throw fetchErr;
        }
        fullContent += contentText;
        // ── Track segments for interleaved rendering ──
        if (contentText) {
            const last = segments[segments.length - 1];
            if (last?.type === "text") {
                segments[segments.length - 1] = { type: "text", content: last.content + contentText };
            }
            else {
                segments.push({ type: "text", content: contentText });
            }
        }
        // ── Model returned tool calls → queue & execute ──
        if (toolCalls.length > 0) {
            if (finishReason && finishReason !== "tool_calls") {
                log.warn(`LLM returned ${toolCalls.length} tool call(s) with finish_reason="${finishReason}" — executing anyway`);
            }
            // Push assistant message with tool_calls to history
            history.push({
                role: "assistant",
                content: contentText || "",
                tool_calls: toolCalls,
            });
            // Enqueue all tool calls with appropriate parallelism hints
            for (const tc of toolCalls) {
                const internalName = fromOpenAIName(tc.function.name);
                queue.enqueue(tc, ToolCallPriority.Normal, isParallelSafe(internalName));
            }
            // Track tool calls as a segment group for interleaved rendering
            const callIds = toolCalls.map(tc => tc.id);
            const lastSeg = segments[segments.length - 1];
            if (lastSeg?.type === "toolGroup") {
                // Extend existing group (shouldn't normally happen, but defensive)
                const merged = new Set([...lastSeg.callIds, ...callIds]);
                segments[segments.length - 1] = { type: "toolGroup", callIds: [...merged] };
            }
            else {
                segments.push({ type: "toolGroup", callIds });
            }
            // ── Plan-mode & Ask-mode interception ──
            // In plan mode, mutating tools are captured as plan actions.
            // In ask mode, any tool that slipped through is blocked.
            if (mode === "plan" || mode === "ask") {
                const intercepted = [];
                const passthrough = [];
                while (!queue.isEmpty) {
                    const batch = queue.dequeueBatch(false);
                    for (const item of batch) {
                        const name = fromOpenAIName(item.toolCall.function.name);
                        const isMutating = MUTATING_TOOLS.has(name);
                        if (mode === "ask" && !ASK_MODE_TOOLS.has(name)) {
                            // Ask mode: block non-read tools, return error to LLM
                            intercepted.push(item);
                        }
                        else if (mode === "plan" && isMutating) {
                            // Plan mode: capture mutating tools as planned actions
                            intercepted.push(item);
                        }
                        else {
                            passthrough.push(item);
                        }
                    }
                }
                // Handle intercepted tool calls
                for (const item of intercepted) {
                    const tc = item.toolCall;
                    const name = fromOpenAIName(tc.function.name);
                    let args;
                    try {
                        args = JSON.parse(tc.function.arguments);
                    }
                    catch {
                        args = {};
                    }
                    if (mode === "ask") {
                        // Return an error to the LLM
                        const msg = `Tool "${name}" is not available in Ask mode. Only read-only tools can be used. Suggest the user switch to Agent or Plan mode for this action.`;
                        history.push({
                            role: "tool",
                            content: JSON.stringify({ ok: false, message: msg }),
                            tool_call_id: tc.id,
                            name: tc.function.name,
                        });
                        executedToolCalls.push({
                            callId: tc.id,
                            tool: name,
                            args,
                            ok: false,
                            message: msg,
                            startedAt: Date.now(),
                            completedAt: Date.now(),
                        });
                    }
                    else {
                        // Plan mode: capture as planned action
                        const action = {
                            id: tc.id,
                            tool: name,
                            args,
                            description: `${name}(${JSON.stringify(args).slice(0, 200)})`,
                            order: plannedActions.length,
                            status: "pending",
                        };
                        plannedActions.push(action);
                        onEvent?.({ type: "plan_action", action });
                        // Tell the LLM the action was captured
                        const msg = `[PLANNED] Action "${name}" has been added to the plan (step ${action.order + 1}). It will execute after user approval. Continue analyzing and propose more actions if needed.`;
                        history.push({
                            role: "tool",
                            content: JSON.stringify({ ok: true, message: msg }),
                            tool_call_id: tc.id,
                            name: tc.function.name,
                        });
                        executedToolCalls.push({
                            callId: tc.id,
                            tool: name,
                            args,
                            ok: true,
                            message: msg,
                            startedAt: Date.now(),
                            completedAt: Date.now(),
                        });
                    }
                }
                // Re-enqueue passthrough items
                for (const item of passthrough) {
                    queue.enqueue(item.toolCall, item.priority, item.parallelSafe);
                }
            }
            // ── Process the queue ──
            while (!queue.isEmpty) {
                if (abort.signal.aborted) {
                    // Mark remaining queued calls as cancelled
                    while (!queue.isEmpty) {
                        const batch = queue.dequeueBatch(false);
                        for (const item of batch) {
                            let rArgs;
                            try {
                                rArgs = JSON.parse(item.toolCall.function.arguments);
                            }
                            catch {
                                rArgs = {};
                            }
                            executedToolCalls.push({
                                callId: item.toolCall.id,
                                tool: fromOpenAIName(item.toolCall.function.name),
                                args: rArgs,
                                ok: false,
                                message: "Cancelled",
                                startedAt: Date.now(),
                                completedAt: Date.now(),
                            });
                        }
                    }
                    return { content: fullContent, executedToolCalls, segments, rounds: round + 1, aborted: true, hitMaxRounds: false };
                }
                const batch = queue.dequeueBatch(parallel);
                if (batch.length === 1) {
                    // Sequential execution (single item or non-parallel-safe)
                    const item = batch[0];
                    const { executed, historyEntry } = await executeOneToolCall({
                        tc: item.toolCall,
                        sessionId,
                        auth,
                        signal: abort.signal,
                        toolRegistry,
                        maxRetries,
                        onEvent,
                        executeTool,
                    });
                    executedToolCalls.push(executed);
                    history.push(historyEntry);
                }
                else {
                    // ── Parallel execution ──
                    log.info(`Executing ${batch.length} tool calls in parallel`);
                    const results = await Promise.all(batch.map((item) => executeOneToolCall({
                        tc: item.toolCall,
                        sessionId,
                        auth,
                        signal: abort.signal,
                        toolRegistry,
                        maxRetries,
                        onEvent,
                        executeTool,
                    })));
                    for (const { executed, historyEntry } of results) {
                        executedToolCalls.push(executed);
                        history.push(historyEntry);
                    }
                }
            }
            // ── Dynamic schema expansion ──
            // If any tool call was tools.search/tools.list, check if the result
            // contains new tool schemas that should be injected for subsequent rounds.
            for (const exec of executedToolCalls) {
                if (exec.tool === "tools.search" && exec.ok && exec.data) {
                    const data = exec.data;
                    if (Array.isArray(data.matches)) {
                        for (const match of data.matches) {
                            if (match.name && match.description && match.parameters) {
                                const oaiName = toOpenAIName(match.name);
                                // In ask mode, only add read-only tools
                                if (mode === "ask" && !ASK_MODE_TOOLS.has(match.name))
                                    continue;
                                if (!activeSchemaNames.has(oaiName) && !disabledTools?.has(match.name)) {
                                    activeSchemas.push({
                                        type: "function",
                                        function: {
                                            name: oaiName,
                                            description: match.description,
                                            parameters: match.parameters,
                                        },
                                    });
                                    activeSchemaNames.add(oaiName);
                                    log.info(`Dynamic schema expansion: added ${match.name}`);
                                }
                            }
                        }
                    }
                }
            }
            // Loop continues — LLM sees results and decides next
            continue;
        }
        // ── Normal text response — done ──
        if (contentText) {
            history.push({ role: "assistant", content: contentText });
            const tcJson = executedToolCalls.length > 0 ? JSON.stringify(executedToolCalls) : undefined;
            const segJson = segments.length > 0 ? JSON.stringify(segments) : undefined;
            onPersist?.(sessionId, "assistant", contentText, tcJson, segJson);
        }
        // ── Emit plan completion in plan mode ──
        if (mode === "plan" && plannedActions.length > 0) {
            onEvent?.({
                type: "plan_complete",
                planId,
                summary: contentText || "Plan ready for review.",
                actions: plannedActions,
            });
        }
        const planResult = mode === "plan" && plannedActions.length > 0
            ? { id: planId, summary: contentText || "Plan ready for review.", actions: plannedActions }
            : undefined;
        return { content: fullContent, executedToolCalls, segments, rounds: round + 1, aborted: false, hitMaxRounds: false, plan: planResult };
    }
    // Hit max rounds
    log.warn(`Agent loop hit max rounds (${maxRounds}) for session ${sessionId}`);
    const msg = "\n\n[Reached maximum tool execution rounds. Stopping.]";
    onEvent?.({ type: "token", content: msg });
    fullContent += msg;
    const planResultMaxRounds = mode === "plan" && plannedActions.length > 0
        ? { id: planId, summary: fullContent, actions: plannedActions }
        : undefined;
    return { content: fullContent, executedToolCalls, segments, rounds: maxRounds, aborted: false, hitMaxRounds: true, plan: planResultMaxRounds };
}
// ── Retry API ────────────────────────────────────────────────────────
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
export async function retryToolCall(callId, history, executedToolCalls, executeTool, sessionId, auth, onEvent, signal) {
    // Find the original call
    const original = executedToolCalls.find((tc) => tc.callId === callId);
    if (!original) {
        return { ok: false, message: `Tool call ${callId} not found` };
    }
    // Find and update history entry
    const histIdx = history.findIndex((m) => m.role === "tool" && m.tool_call_id === callId);
    const startedAt = Date.now();
    onEvent?.({
        type: "tool_start",
        tool: original.tool,
        args: original.args,
        call_id: callId,
    });
    const result = await executeTool(original.tool, original.args, sessionId, auth, (chunk) => onEvent?.({ type: "tool_output", call_id: callId, content: chunk }), signal);
    const completedAt = Date.now();
    onEvent?.({
        type: "tool_result",
        call_id: callId,
        tool: original.tool,
        ok: result.ok,
        message: result.message,
        data: result.data,
    });
    // Update the executed tool call record
    original.ok = result.ok;
    original.message = result.message;
    original.data = result.data;
    original.startedAt = startedAt;
    original.completedAt = completedAt;
    original.retryCount = (original.retryCount ?? 0) + 1;
    // Update conversation history so the LLM sees the new result
    if (histIdx !== -1) {
        history[histIdx] = {
            role: "tool",
            content: JSON.stringify({ ok: result.ok, message: result.message, data: result.data }),
            tool_call_id: callId,
            name: toOpenAIName(original.tool),
        };
    }
    return result;
}
//# sourceMappingURL=agent-loop.js.map