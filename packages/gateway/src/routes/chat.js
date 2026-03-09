import { inferContextWindow } from "../config.js";
import { FileSystemSurface } from "../surfaces/filesystem.js";
import { resolveWorkspaceRoot } from "../tools/core/get-fs.js";
import { messages as messagesTable } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { uuidv7 } from "../lib/uuidv7.js";
import { requireAuth } from "../security/http-auth.js";
import { runAgentLoop, retryToolCall, buildTieredToolSchemas, fromOpenAIName, SteeringController, } from "../tools/agent-loop.js";
import { isValidChatMode, } from "../tools/chat-modes.js";
import { buildSystemPrompt } from "../tools/prompts/index.js";
// ── In-memory state ──────────────────────────────────────────────────
const sessionHistory = new Map();
const activeStreams = new Set();
const sessionAbortControllers = new Map();
/** Persistent CLI provider sessions — kept alive across turns so the agent retains conversation context */
const activeCliSessions = new Map();
const sessionSubscribers = new Map();
const DEFAULT_UI_MESSAGE_LIMIT = 120;
const MAX_UI_MESSAGE_LIMIT = 500;
function parseToolArguments(raw) {
    if (!raw)
        return {};
    try {
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
function mapPendingToolCallsForUI(toolCalls, resultStateByCallId) {
    const now = Date.now();
    return toolCalls.map((tc) => ({
        callId: tc.id,
        tool: fromOpenAIName(tc.function.name),
        args: parseToolArguments(tc.function.arguments),
        ...(resultStateByCallId?.has(tc.id)
            ? {
                status: resultStateByCallId.get(tc.id).ok ? "success" : "error",
                ok: resultStateByCallId.get(tc.id).ok,
                message: resultStateByCallId.get(tc.id).message,
                data: resultStateByCallId.get(tc.id).data,
                completedAt: now,
            }
            : {
                status: "running",
                startedAt: now,
            }),
    }));
}
function mapPersistedToolCallsForUI(toolCalls) {
    return toolCalls.map((tc) => ({
        callId: tc.callId,
        tool: tc.tool,
        args: (typeof tc.args === "object" && tc.args !== null ? tc.args : {}),
        status: tc.ok ? "success" : "error",
        ok: tc.ok,
        message: tc.message,
        output: tc.output,
        data: tc.data,
        startedAt: tc.startedAt,
        completedAt: tc.completedAt,
    }));
}
function buildToolResultStateMap(history) {
    const out = new Map();
    for (const msg of history) {
        if (msg.role !== "tool" || !msg.tool_call_id)
            continue;
        let parsed;
        try {
            parsed = JSON.parse(msg.content);
        }
        catch {
            // Keep best effort fallback below.
        }
        const ok = typeof parsed?.ok === "boolean" ? parsed.ok : false;
        const message = typeof parsed?.message === "string"
            ? parsed.message
            : (msg.content?.trim() || (ok ? "Completed" : "Failed"));
        out.set(msg.tool_call_id, {
            ok,
            message,
            data: parsed?.data,
        });
    }
    return out;
}
function emitToSubscribers(sessionId, event) {
    const subs = sessionSubscribers.get(sessionId);
    if (subs)
        for (const fn of subs)
            fn(event);
}
function subscribe(sessionId, fn) {
    if (!sessionSubscribers.has(sessionId))
        sessionSubscribers.set(sessionId, new Set());
    sessionSubscribers.get(sessionId).add(fn);
    return () => {
        const subs = sessionSubscribers.get(sessionId);
        if (subs) {
            subs.delete(fn);
            if (subs.size === 0)
                sessionSubscribers.delete(sessionId);
        }
    };
}
function parseMessageLimit(raw) {
    const parsed = typeof raw === "number"
        ? raw
        : typeof raw === "string"
            ? Number.parseInt(raw, 10)
            : Number.NaN;
    if (!Number.isFinite(parsed) || parsed <= 0)
        return DEFAULT_UI_MESSAGE_LIMIT;
    return Math.min(Math.floor(parsed), MAX_UI_MESSAGE_LIMIT);
}
function windowMessages(messages, limit) {
    const total = messages.length;
    const start = Math.max(total - limit, 0);
    return {
        messages: messages.slice(start),
        total,
        hasMore: start > 0,
    };
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function buildVisibleHistoryEntries(sessionId, history, options) {
    const out = [];
    let visibleIndex = 0;
    const includePendingAssistantToolCalls = options?.includePendingAssistantToolCalls === true;
    const toolResultStateByCallId = includePendingAssistantToolCalls
        ? buildToolResultStateMap(history)
        : undefined;
    for (let i = 0; i < history.length; i++) {
        const m = history[i];
        if (m.role === "system" || m.role === "tool")
            continue;
        let uiToolCalls;
        if (m.role === "assistant") {
            if (Array.isArray(m.uiToolCalls) && m.uiToolCalls.length > 0) {
                uiToolCalls = mapPersistedToolCallsForUI(m.uiToolCalls);
            }
            else if (m.tool_calls && includePendingAssistantToolCalls) {
                uiToolCalls = mapPendingToolCallsForUI(m.tool_calls, toolResultStateByCallId);
            }
        }
        if (m.role === "assistant" && m.tool_calls && !m.content && !includePendingAssistantToolCalls) {
            continue;
        }
        out.push({
            id: `${sessionId}-${visibleIndex}`,
            role: m.role,
            content: m.content,
            toolCalls: uiToolCalls,
            segments: m.segments,
            historyIndex: i,
        });
        visibleIndex++;
    }
    return out;
}
function buildVisibleHistoryMessages(sessionId, history, options) {
    return buildVisibleHistoryEntries(sessionId, history, options).map(({ id, role, content, toolCalls, segments }) => ({
        id,
        role,
        content,
        toolCalls,
        segments,
    }));
}
// ── System prompt ────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Jait — Just Another Intelligent Tool. You are a capable AI assistant that can run shell commands, read/write files, and manage system surfaces.

When the user asks you to do something that requires action (run a command, edit a file, check system info, etc.), use your tools. Don't just describe what you would do — actually do it.

Key capabilities:
- terminal.run: Execute shell commands (PowerShell on Windows). Always use this to run commands.
- file.read / file.write / file.patch: Read, create, and edit files.
- file.list / file.stat: Browse the filesystem.
- os.query: Get system info, running processes, disk usage.
- surfaces.list / surfaces.start / surfaces.stop: Manage terminal and filesystem surfaces.
- cron.add / cron.list / cron.update / cron.remove: Create and manage recurring Jait jobs.

Guidelines:
- Be direct and concise.
- When running commands, use the actual tools — don't just suggest commands.
- For multi-step tasks, execute them step by step, checking each result.
- If a command fails, analyze the error and try to fix it.
- When editing files, read them first to understand the context before patching.
- For recurring or scheduled automation requests, prefer cron tools and Jait jobs instead of OS-native schedulers.
- Do not create Windows Task Scheduler jobs unless the user explicitly asks for OS-native scheduling.`;
/** Max agentic loop iterations to prevent infinite loops */
const MAX_TOOL_ROUNDS = 15;
// ── Module-level DB ref for persistence from extracted functions ──────
let _dbRef;
let _appRef;
function persistMessageGlobal(sessionId, role, content, toolCalls, segments) {
    if (!_dbRef)
        return;
    try {
        _dbRef.insert(messagesTable)
            .values({
            id: crypto.randomUUID(),
            sessionId,
            role,
            content,
            toolCalls: toolCalls ?? null,
            segments: segments ?? null,
            createdAt: new Date().toISOString(),
        })
            .run();
    }
    catch (err) {
        _appRef?.log.error(err, "Failed to persist message");
    }
}
export function registerChatRoutes(app, config, depsOrDb, sessionServiceArg) {
    // Support both old signature (db, sessionService) and new deps object
    let db;
    let sessionService;
    let userService;
    let toolRegistry;
    let surfaceRegistry;
    let audit;
    let toolExecutor;
    let memoryService;
    let ws;
    let sessionStateService;
    let providerRegistry;
    if (depsOrDb && typeof depsOrDb === "object" && "sessionService" in depsOrDb) {
        const deps = depsOrDb;
        db = deps.db;
        sessionService = deps.sessionService;
        userService = deps.userService;
        toolRegistry = deps.toolRegistry;
        surfaceRegistry = deps.surfaceRegistry;
        audit = deps.audit;
        toolExecutor = deps.toolExecutor;
        memoryService = deps.memoryService;
        ws = deps.ws;
        sessionStateService = deps.sessionState;
        providerRegistry = deps.providerRegistry;
    }
    else {
        db = depsOrDb;
        sessionService = sessionServiceArg;
    }
    // Store refs for persistence from extracted functions
    _dbRef = db;
    _appRef = app;
    const hasTools = !!toolRegistry && toolRegistry.list().length > 0;
    // ── Per-session steering controllers and executed tool call tracking ──
    const sessionSteeringControllers = new Map();
    const sessionExecutedToolCalls = new Map();
    /** Plans produced by plan mode — keyed by session ID */
    const sessionPlans = new Map();
    app.log.info(`Chat route: ${hasTools ? toolRegistry.list().length + " tools available for agent (tiered)" : "no tools (text-only mode)"}`);
    // Hydrate in-memory cache from DB if session not yet loaded
    function hydrateSession(sessionId) {
        if (sessionHistory.has(sessionId))
            return;
        if (!db)
            return;
        const rows = db
            .select()
            .from(messagesTable)
            .where(eq(messagesTable.sessionId, sessionId))
            .orderBy(messagesTable.createdAt)
            .all();
        if (rows.length > 0) {
            sessionHistory.set(sessionId, [
                { role: "system", content: SYSTEM_PROMPT },
                ...rows.map((r) => {
                    let uiToolCalls;
                    let segments;
                    if (r.toolCalls) {
                        try {
                            const parsed = JSON.parse(r.toolCalls);
                            if (Array.isArray(parsed)) {
                                uiToolCalls = parsed;
                            }
                        }
                        catch {
                            // Ignore malformed historical toolCalls payloads.
                        }
                    }
                    if (r.segments) {
                        try {
                            const parsed = JSON.parse(r.segments);
                            if (Array.isArray(parsed)) {
                                segments = parsed;
                            }
                        }
                        catch { /* ignore */ }
                    }
                    return {
                        role: r.role,
                        content: r.content,
                        uiToolCalls,
                        segments,
                    };
                }),
            ]);
        }
    }
    function persistMessage(sessionId, role, content, toolCalls, segments) {
        if (!db)
            return;
        try {
            db.insert(messagesTable)
                .values({
                id: crypto.randomUUID(),
                sessionId,
                role,
                content,
                toolCalls: toolCalls ?? null,
                segments: segments ?? null,
                createdAt: new Date().toISOString(),
            })
                .run();
        }
        catch (err) {
            app.log.error(err, "Failed to persist message");
        }
    }
    // ── Tool execution helper ──────────────────────────────────────────
    async function executeTool(toolName, args, sessionId, auth, onOutputChunk, signal) {
        if (!toolRegistry) {
            return { ok: false, message: "Tool registry not available" };
        }
        if (signal?.aborted) {
            return { ok: false, message: "Cancelled" };
        }
        const context = {
            sessionId,
            actionId: uuidv7(),
            workspaceRoot: surfaceRegistry
                ? resolveWorkspaceRoot(surfaceRegistry, sessionId)
                : process.cwd(),
            requestedBy: "agent",
            userId: auth?.userId,
            apiKeys: auth?.apiKeys,
            onOutputChunk,
            signal,
        };
        try {
            const toolPromise = toolExecutor
                ? toolExecutor(toolName, args, context)
                : toolRegistry.execute(toolName, args, context, audit);
            // Race the tool execution against the abort signal so a stuck tool
            // (e.g. browser launch hanging) doesn't block the cancel flow forever.
            if (signal && !signal.aborted) {
                const abortPromise = new Promise((resolve) => {
                    const onAbort = () => resolve({ ok: false, message: "Cancelled" });
                    signal.addEventListener("abort", onAbort, { once: true });
                    // Clean up if the tool finishes first
                    toolPromise.finally(() => signal.removeEventListener("abort", onAbort));
                });
                return await Promise.race([toolPromise, abortPromise]);
            }
            return await toolPromise;
        }
        catch (err) {
            if (signal?.aborted)
                return { ok: false, message: "Cancelled" };
            return { ok: false, message: err instanceof Error ? err.message : String(err) };
        }
    }
    // ══ POST /api/chat — Main chat endpoint with agentic tool loop ═════
    app.post("/api/chat", async (request, reply) => {
        const authUser = await requireAuth(request, reply, config.jwtSecret);
        if (!authUser)
            return;
        const body = request.body;
        const content = typeof body["content"] === "string"
            ? body["content"]
            : typeof body["message"] === "string"
                ? body["message"]
                : "";
        const sessionId = typeof body["sessionId"] === "string"
            ? body["sessionId"]
            : typeof body["session_id"] === "string"
                ? body["session_id"]
                : crypto.randomUUID();
        const chatMode = isValidChatMode(body["mode"]) ? body["mode"] : "agent";
        const requestProvider = typeof body["provider"] === "string"
            ? body["provider"]
            : undefined;
        if (!content.trim()) {
            return reply
                .status(400)
                .send({ error: "VALIDATION_ERROR", details: "content is required" });
        }
        if (sessionService) {
            const session = sessionService.getById(sessionId, authUser.id);
            if (!session) {
                return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
            }
        }
        const userApiKeys = userService?.getSettings(authUser.id).apiKeys ?? {};
        const effectiveModel = userApiKeys["OPENAI_MODEL"]?.trim() || config.openaiModel;
        const llmRuntime = {
            openaiApiKey: userApiKeys["OPENAI_API_KEY"]?.trim() || config.openaiApiKey,
            openaiBaseUrl: userApiKeys["OPENAI_BASE_URL"]?.trim() || config.openaiBaseUrl,
            openaiModel: effectiveModel,
            contextWindow: userApiKeys["OPENAI_MODEL"]?.trim()
                ? inferContextWindow(effectiveModel)
                : config.contextWindow,
        };
        // Set SSE headers
        reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        });
        // Build model endpoint for prompt resolution
        const modelEndpoint = {
            model: llmRuntime.openaiModel,
            baseUrl: llmRuntime.openaiBaseUrl,
        };
        // Build conversation history (hydrate from DB if needed)
        hydrateSession(sessionId);
        // Resolve workspace root so the system prompt includes it
        const sessionRecord = sessionService?.getById(sessionId);
        const wsRoot = surfaceRegistry
            ? resolveWorkspaceRoot(surfaceRegistry, sessionId, sessionRecord?.workspacePath)
            : (sessionRecord?.workspacePath?.trim() || process.cwd());
        const promptCtx = { workspaceRoot: wsRoot };
        if (!sessionHistory.has(sessionId)) {
            sessionHistory.set(sessionId, [
                { role: "system", content: buildSystemPrompt(chatMode, modelEndpoint, promptCtx) },
            ]);
        }
        else {
            // Update system prompt if mode/model/workspace changed mid-session
            const h = sessionHistory.get(sessionId);
            const modePrompt = buildSystemPrompt(chatMode, modelEndpoint, promptCtx);
            if (h[0]?.role === "system" && h[0].content !== modePrompt) {
                h[0] = { role: "system", content: modePrompt };
            }
        }
        const history = sessionHistory.get(sessionId);
        history.push({ role: "user", content });
        persistMessage(sessionId, "user", content);
        try {
            sessionService?.touch(sessionId);
        }
        catch { /* session may not exist */ }
        const streamAbort = new AbortController();
        sessionAbortControllers.set(sessionId, streamAbort);
        let fullContent = "";
        let partialToolCalls = [];
        let resultSegmentsJson;
        let hitMaxRounds = false;
        activeStreams.add(sessionId);
        let clientDisconnected = false;
        reply.raw.on("close", () => { clientDisconnected = true; });
        const safeWrite = (data) => {
            if (!clientDisconnected) {
                try {
                    reply.raw.write(data);
                }
                catch {
                    clientDisconnected = true;
                }
            }
        };
        const providerLabel = requestProvider === "codex"
            ? "Codex"
            : requestProvider === "claude-code"
                ? "Claude Code"
                : config.llmProvider === "openai" ? "OpenAI" : "Ollama";
        // Create steering controller for this session
        const steering = new SteeringController();
        sessionSteeringControllers.set(sessionId, steering);
        try {
            // ══ CLI Provider path (codex / claude-code via MCP) ══════════
            if (requestProvider && requestProvider !== "jait" && providerRegistry) {
                const cliProvider = providerRegistry.get(requestProvider);
                if (!cliProvider) {
                    safeWrite(`data: ${JSON.stringify({ type: "error", message: `Unknown provider: ${requestProvider}` })}\n\n`);
                    reply.raw.end();
                    return;
                }
                const available = await cliProvider.checkAvailability();
                if (!available) {
                    safeWrite(`data: ${JSON.stringify({ type: "error", message: `Provider ${requestProvider} is not available: ${cliProvider.info.unavailableReason}` })}\n\n`);
                    reply.raw.end();
                    return;
                }
                const cliWsRoot = surfaceRegistry
                    ? resolveWorkspaceRoot(surfaceRegistry, sessionId, sessionRecord?.workspacePath)
                    : (sessionRecord?.workspacePath?.trim() || process.cwd());
                console.log(`[chat/cli] session=${sessionId} wsRoot="${cliWsRoot}" session.workspacePath="${sessionRecord?.workspacePath}" surfaces=${surfaceRegistry?.getBySession(sessionId)?.length ?? 0}`);
                // Ensure a FileSystemSurface exists for this session so we can
                // back up files before CLI providers (Codex/Claude) write them,
                // enabling the keep/discard (undo) flow.
                let cliFsSurface = null;
                if (surfaceRegistry) {
                    const fsId = `fs-${sessionId}`;
                    const existing = surfaceRegistry.getSurface(fsId);
                    if (existing instanceof FileSystemSurface && existing.state === "running") {
                        cliFsSurface = existing;
                    }
                    else {
                        try {
                            const started = await surfaceRegistry.startSurface("filesystem", fsId, {
                                sessionId,
                                workspaceRoot: cliWsRoot,
                            });
                            cliFsSurface = started;
                        }
                        catch { /* best effort */ }
                    }
                }
                const mcpServers = [providerRegistry.buildJaitMcpServerRef(config)];
                // ── Reuse an existing CLI session if one is alive for this Jait session ──
                const cachedCliSession = activeCliSessions.get(sessionId);
                let providerSessionId;
                if (cachedCliSession && cachedCliSession.providerId === requestProvider) {
                    // Existing session with the same provider — try to reuse it
                    providerSessionId = cachedCliSession.providerSessionId;
                    console.log(`[chat/cli] Reusing ${requestProvider} session ${providerSessionId} for ${sessionId}`);
                }
                else {
                    // If the user switched providers, stop the old session first
                    if (cachedCliSession) {
                        const oldProvider = providerRegistry.get(cachedCliSession.providerId);
                        if (oldProvider) {
                            try {
                                await oldProvider.stopSession(cachedCliSession.providerSessionId);
                            }
                            catch { /* best effort */ }
                        }
                        activeCliSessions.delete(sessionId);
                    }
                    const session = await cliProvider.startSession({
                        threadId: sessionId,
                        workingDirectory: cliWsRoot,
                        mode: "full-access",
                        model: typeof body["model"] === "string" ? body["model"] : undefined,
                        mcpServers,
                    });
                    providerSessionId = session.id;
                    activeCliSessions.set(sessionId, { providerId: requestProvider, providerSessionId });
                    console.log(`[chat/cli] Started new ${requestProvider} session ${providerSessionId} for ${sessionId}`);
                }
                // Collect full content from CLI provider events
                const contentChunks = [];
                // ── Accumulate tool calls + segments for persistence ──
                const cliToolCalls = [];
                const cliSegments = [];
                /** Track the current pending tool-group callIds (batched between text tokens) */
                let pendingToolGroup = [];
                let lastSegmentWasText = false;
                /** Flush any buffered text into a text segment */
                const flushTextSegment = () => {
                    if (lastSegmentWasText)
                        return; // already flushed
                    const text = contentChunks.join("");
                    // Only create a segment if there's new text since the last tool group
                    const prevTextLen = cliSegments
                        .filter((s) => s.type === "text")
                        .reduce((n, s) => n + s.content.length, 0);
                    const newText = text.slice(prevTextLen);
                    if (newText) {
                        cliSegments.push({ type: "text", content: newText });
                    }
                    lastSegmentWasText = true;
                };
                /** Flush any pending tool group into a segment */
                const flushToolGroup = () => {
                    if (pendingToolGroup.length > 0) {
                        // Before adding a tool group, flush any preceding text
                        flushTextSegment();
                        cliSegments.push({ type: "toolGroup", callIds: [...pendingToolGroup] });
                        pendingToolGroup = [];
                        lastSegmentWasText = false;
                    }
                };
                const unsubscribe = cliProvider.onEvent((event) => {
                    if (event.sessionId !== providerSessionId) {
                        return;
                    }
                    // Map provider events to SSE events the frontend understands
                    switch (event.type) {
                        case "token":
                            // If there's a pending tool group, flush it first
                            flushToolGroup();
                            contentChunks.push(event.content);
                            lastSegmentWasText = false; // new text arrived
                            safeWrite(`data: ${JSON.stringify({ type: "token", content: event.content })}\n\n`);
                            emitToSubscribers(sessionId, { type: "token", content: event.content });
                            break;
                        case "tool.start": {
                            const callId = event.callId ?? `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                            // Accumulate for persistence
                            cliToolCalls.push({
                                callId,
                                tool: event.tool,
                                args: event.args ?? {},
                                ok: true,
                                message: "",
                                startedAt: Date.now(),
                            });
                            pendingToolGroup.push(callId);
                            // Save backup of original file *before* CLI provider writes it
                            if (event.tool === "edit" && cliFsSurface) {
                                const editPath = String(event.args?.path ?? "");
                                if (editPath) {
                                    cliFsSurface.saveExternalBackup(editPath).catch(() => { });
                                }
                            }
                            safeWrite(`data: ${JSON.stringify({ type: "tool_start", call_id: callId, tool: event.tool, args: event.args })}\n\n`);
                            emitToSubscribers(sessionId, { type: "tool_start", call_id: callId, tool: event.tool, args: event.args });
                            break;
                        }
                        case "tool.output": {
                            // Accumulate streaming output on the matching tool call
                            const tc = cliToolCalls.find(t => t.callId === event.callId);
                            if (tc) {
                                tc.message = (tc.message || "") + event.content;
                            }
                            safeWrite(`data: ${JSON.stringify({ type: "tool_output", call_id: event.callId, content: event.content })}\n\n`);
                            break;
                        }
                        case "tool.result": {
                            const resultCallId = event.callId ?? `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                            // Update the matching tool call record
                            const tc = cliToolCalls.find(t => t.callId === resultCallId);
                            if (tc) {
                                tc.ok = event.ok;
                                tc.message = event.message || tc.message;
                                tc.data = event.data;
                                tc.completedAt = Date.now();
                            }
                            safeWrite(`data: ${JSON.stringify({ type: "tool_result", call_id: resultCallId, tool: event.tool, ok: event.ok, message: event.message, data: event.data })}\n\n`);
                            emitToSubscribers(sessionId, { type: "tool_result", call_id: resultCallId, tool: event.tool, ok: event.ok, message: event.message });
                            // Emit file_changed for successful edits → drives the keep/discard UI
                            if (event.ok && event.tool === "edit") {
                                const editPath = String(tc?.args ? tc.args.path ?? "" : "");
                                if (editPath) {
                                    const editName = editPath.split(/[\/\\]/).pop() ?? editPath;
                                    safeWrite(`data: ${JSON.stringify({ type: "file_changed", path: editPath, name: editName })}\n\n`);
                                    // Broadcast to other session clients
                                    if (ws) {
                                        ws.broadcast(sessionId, {
                                            type: "ui.state-sync",
                                            sessionId,
                                            timestamp: new Date().toISOString(),
                                            payload: { key: "file_changed", value: { path: editPath, name: editName } },
                                        });
                                    }
                                    // Persist cumulative changed files list
                                    if (sessionStateService) {
                                        try {
                                            const existing = sessionStateService.get(sessionId, ["changed_files"]);
                                            const files = Array.isArray(existing["changed_files"]) ? existing["changed_files"] : [];
                                            if (!files.some((f) => f.path === editPath)) {
                                                files.push({ path: editPath, name: editName });
                                                sessionStateService.set(sessionId, { changed_files: files });
                                            }
                                        }
                                        catch { /* ignore */ }
                                    }
                                }
                            }
                            break;
                        }
                        case "tool.approval-required":
                            safeWrite(`data: ${JSON.stringify({ type: "approval_required", tool: event.tool, args: event.args, requestId: event.requestId })}\n\n`);
                            break;
                        case "message":
                            if (event.role === "assistant") {
                                flushToolGroup();
                                contentChunks.push(event.content);
                                lastSegmentWasText = false;
                            }
                            break;
                        case "session.error":
                            safeWrite(`data: ${JSON.stringify({ type: "error", message: event.error })}\n\n`);
                            break;
                    }
                });
                // Send the turn — with recovery if the cached session died between messages
                try {
                    await cliProvider.sendTurn(providerSessionId, content);
                }
                catch (sendErr) {
                    // Session likely died (process exited) — start a fresh one
                    console.warn(`[chat/cli] sendTurn failed on cached session, recovering:`, sendErr);
                    activeCliSessions.delete(sessionId);
                    const freshSession = await cliProvider.startSession({
                        threadId: sessionId,
                        workingDirectory: cliWsRoot,
                        mode: "full-access",
                        model: typeof body["model"] === "string" ? body["model"] : undefined,
                        mcpServers,
                    });
                    providerSessionId = freshSession.id;
                    activeCliSessions.set(sessionId, { providerId: requestProvider, providerSessionId });
                    console.log(`[chat/cli] Recovered with new session ${providerSessionId}`);
                    await cliProvider.sendTurn(providerSessionId, content);
                }
                // Wait for turn completion or error
                await new Promise((resolve) => {
                    const checkDone = cliProvider.onEvent((event) => {
                        if (event.sessionId !== providerSessionId) {
                            return;
                        }
                        if (event.type === "session.completed" || event.type === "session.error") {
                            // If the session errored, invalidate the cache so the next message creates a fresh one
                            if (event.type === "session.error") {
                                activeCliSessions.delete(sessionId);
                            }
                            checkDone();
                            resolve();
                        }
                    });
                    // Also abort if client disconnects
                    streamAbort.signal.addEventListener("abort", () => {
                        cliProvider.interruptTurn(providerSessionId).catch(() => { });
                        resolve();
                    });
                });
                unsubscribe();
                fullContent = contentChunks.join("");
                // Flush any remaining tool group / trailing text into segments
                flushToolGroup();
                flushTextSegment();
                // Build persistence JSON
                const cliTcJson = cliToolCalls.length > 0 ? JSON.stringify(cliToolCalls) : undefined;
                const cliSegJson = cliSegments.length > 0 ? JSON.stringify(cliSegments) : undefined;
                // Also stash on the outer scope so the done handler can emit them
                partialToolCalls = cliToolCalls;
                resultSegmentsJson = cliSegJson;
                // Persist assistant message with tool calls and segments
                history.push({ role: "assistant", content: fullContent, uiToolCalls: cliToolCalls.length > 0 ? cliToolCalls : undefined });
                persistMessage(sessionId, "assistant", fullContent, cliTcJson, cliSegJson);
                // Session stays alive for the next turn — do NOT stop it.
                // It will be cleaned up on session error, provider switch, or server shutdown.
            }
            else if (config.llmProvider === "openai") {
                // ══ OpenAI agentic loop (using extracted runAgentLoop) ═════
                // Build tiered schemas per request — respects user-disabled tools
                const userSettings = userService?.getSettings(authUser.id);
                const disabledTools = userSettings?.disabledTools?.length
                    ? new Set(userSettings.disabledTools)
                    : undefined;
                const toolSchemas = toolRegistry
                    ? buildTieredToolSchemas(toolRegistry, disabledTools)
                    : [];
                const onEvent = (event) => {
                    emitToSubscribers(sessionId, event);
                    safeWrite(`data: ${JSON.stringify(event)}\n\n`);
                    // ── Cross-client sync: persist & broadcast state changes ──
                    const ev = event;
                    // Broadcast todo list updates to all session clients and persist to DB
                    if (ev.type === "todo_list" && Array.isArray(ev.items)) {
                        if (sessionStateService) {
                            try {
                                sessionStateService.set(sessionId, { "todo_list": ev.items });
                            }
                            catch { /* ignore */ }
                        }
                        if (ws) {
                            ws.broadcast(sessionId, {
                                type: "ui.state-sync",
                                sessionId,
                                timestamp: new Date().toISOString(),
                                payload: { key: "todo_list", value: ev.items },
                            });
                        }
                    }
                    // Broadcast file change events and persist cumulative list
                    if (ev.type === "file_changed" && typeof ev.path === "string") {
                        if (ws) {
                            ws.broadcast(sessionId, {
                                type: "ui.state-sync",
                                sessionId,
                                timestamp: new Date().toISOString(),
                                payload: { key: "file_changed", value: { path: ev.path, name: ev.name } },
                            });
                        }
                        // Persist cumulative changed files list
                        if (sessionStateService) {
                            try {
                                const existing = sessionStateService.get(sessionId, ["changed_files"]);
                                const files = Array.isArray(existing["changed_files"]) ? existing["changed_files"] : [];
                                if (!files.some((f) => f.path === ev.path)) {
                                    files.push({ path: ev.path, name: ev.name ?? "" });
                                    sessionStateService.set(sessionId, { "changed_files": files });
                                }
                            }
                            catch { /* ignore */ }
                        }
                    }
                };
                const result = await runAgentLoop({
                    llm: llmRuntime,
                    history,
                    toolSchemas,
                    hasTools,
                    sessionId,
                    auth: { userId: authUser.id, apiKeys: userApiKeys },
                    abort: streamAbort,
                    maxRounds: MAX_TOOL_ROUNDS,
                    parallel: true,
                    toolRegistry,
                    disabledTools,
                    mode: chatMode,
                    onEvent,
                    onPersist: (sid, role, content, tc, seg) => persistMessage(sid, role, content, tc, seg),
                    log: app.log,
                }, executeTool, steering);
                fullContent = result.content;
                partialToolCalls = result.executedToolCalls;
                resultSegmentsJson = result.segments.length > 0 ? JSON.stringify(result.segments) : undefined;
                hitMaxRounds = result.hitMaxRounds;
                // Track executed tool calls for retry API
                sessionExecutedToolCalls.set(sessionId, result.executedToolCalls);
                // Store plan if plan mode produced one
                if (result.plan) {
                    sessionPlans.set(sessionId, result.plan);
                }
            }
            else {
                // ══ Ollama (text only — no tool support) ═══════════════════
                fullContent = await runOllamaStream(config, history, sessionId, streamAbort, safeWrite, app);
            }
        }
        catch (err) {
            // The OpenAI agentic loop now handles AbortError internally and returns
            // partial results.  This catch only fires for non-abort errors (OpenAI)
            // or for Ollama stream errors (including abort).
            const wasCancelled = err instanceof Error && err.name === "AbortError";
            if (!wasCancelled)
                app.log.error(err, `${providerLabel} streaming error`);
            // Save partial content for real (non-cancel) errors
            if (!wasCancelled && (fullContent || partialToolCalls.length > 0)) {
                const tcJson = partialToolCalls.length > 0 ? JSON.stringify(partialToolCalls) : undefined;
                persistMessage(sessionId, "assistant", fullContent || "", tcJson, resultSegmentsJson);
            }
            const errMsg = wasCancelled
                ? "cancelled"
                : err instanceof Error ? err.message : `Failed to reach ${providerLabel}`;
            emitToSubscribers(sessionId, wasCancelled
                ? { type: "done", session_id: sessionId, prompt_count: history.filter(m => m.role === "user").length, remaining_prompts: null }
                : { type: "error", message: errMsg });
            try {
                safeWrite(`data: ${JSON.stringify(wasCancelled ? { type: "done", session_id: sessionId } : { type: "error", message: errMsg })}\n\n`);
            }
            catch { /* client gone */ }
        }
        // Persist partial results BEFORE clearing stream state so that a reload
        // between these two steps loads the cancelled tool calls from the DB.
        if (streamAbort.signal.aborted && partialToolCalls.length > 0) {
            const tcJson = JSON.stringify(partialToolCalls);
            persistMessage(sessionId, "assistant", fullContent || "", tcJson, resultSegmentsJson);
        }
        activeStreams.delete(sessionId);
        sessionAbortControllers.delete(sessionId);
        sessionSteeringControllers.delete(sessionId);
        // Clean up in-memory history: remove any dangling assistant tool_calls
        // messages that never got a text response (e.g. cancelled mid-tool-call).
        // This prevents them from showing as "running" on reload.
        const currentHistory = sessionHistory.get(sessionId);
        if (currentHistory) {
            // Walk backwards: if the last messages are assistant+tool_calls with no
            // following text response, and the corresponding tool results are missing,
            // remove them so the history is clean for the next session load.
            while (currentHistory.length > 0) {
                const last = currentHistory[currentHistory.length - 1];
                // Remove orphaned tool result messages at the tail
                if (last.role === "tool") {
                    currentHistory.pop();
                    continue;
                }
                // Remove assistant messages that only contain tool_calls with no text
                if (last.role === "assistant" && last.tool_calls && !last.content) {
                    currentHistory.pop();
                    continue;
                }
                break;
            }
        }
        // Final done event
        const doneEvent = {
            type: "done",
            session_id: sessionId,
            prompt_count: history.filter(m => m.role === "user").length,
            remaining_prompts: null,
            hit_max_rounds: hitMaxRounds,
        };
        emitToSubscribers(sessionId, doneEvent);
        safeWrite(`data: ${JSON.stringify(doneEvent)}\n\n`);
        try {
            reply.raw.end();
        }
        catch { /* already closed */ }
        // Notify all WS-subscribed clients that the chat is done so they can refresh.
        if (ws) {
            ws.broadcast(sessionId, {
                type: "message.complete",
                sessionId,
                timestamp: new Date().toISOString(),
                payload: {},
            });
        }
    });
    // Cancel an active stream for a session
    app.post("/api/sessions/:sessionId/cancel", async (request, reply) => {
        const authUser = await requireAuth(request, reply, config.jwtSecret);
        if (!authUser)
            return;
        const { sessionId } = request.params;
        if (sessionService) {
            const session = sessionService.getById(sessionId, authUser.id);
            if (!session) {
                return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
            }
        }
        const controller = sessionAbortControllers.get(sessionId);
        if (controller) {
            controller.abort();
            return { ok: true, cancelled: true };
        }
        return { ok: true, cancelled: false };
    });
    // Truncate a session from a specific user message onward (used for edit + replay).
    app.post("/api/sessions/:sessionId/restart-from", async (request, reply) => {
        const authUser = await requireAuth(request, reply, config.jwtSecret);
        if (!authUser)
            return;
        const { sessionId } = request.params;
        if (sessionService) {
            const session = sessionService.getById(sessionId, authUser.id);
            if (!session) {
                return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
            }
        }
        const body = request.body ?? {};
        const messageId = typeof body["messageId"] === "string" ? body["messageId"] : "";
        const messageIndex = typeof body["messageIndex"] === "number" ? body["messageIndex"] : -1;
        const messageFromEnd = typeof body["messageFromEnd"] === "number" ? body["messageFromEnd"] : -1;
        if (!messageId && messageIndex < 0 && messageFromEnd < 0) {
            return reply.status(400).send({ error: "VALIDATION_ERROR", details: "messageId, messageFromEnd, or messageIndex is required" });
        }
        if (activeStreams.has(sessionId)) {
            const controller = sessionAbortControllers.get(sessionId);
            if (controller)
                controller.abort();
            const deadline = Date.now() + 5000;
            while (activeStreams.has(sessionId) && Date.now() < deadline) {
                await sleep(50);
            }
            if (activeStreams.has(sessionId)) {
                return reply.status(409).send({ error: "CONFLICT", details: "Cannot restart while session is streaming" });
            }
        }
        hydrateSession(sessionId);
        const history = sessionHistory.get(sessionId) ?? [];
        const visibleEntries = buildVisibleHistoryEntries(sessionId, history);
        let targetVisibleIndex = visibleEntries.findIndex((m) => m.id === messageId);
        if (targetVisibleIndex === -1 &&
            Number.isFinite(messageFromEnd) &&
            messageFromEnd >= 0 &&
            messageFromEnd < visibleEntries.length) {
            targetVisibleIndex = visibleEntries.length - 1 - Math.floor(messageFromEnd);
        }
        if (targetVisibleIndex === -1 &&
            Number.isFinite(messageIndex) &&
            messageIndex >= 0 &&
            messageIndex < visibleEntries.length) {
            targetVisibleIndex = Math.floor(messageIndex);
        }
        if (targetVisibleIndex === -1) {
            return reply.status(404).send({ error: "NOT_FOUND", details: "Message not found" });
        }
        const target = visibleEntries[targetVisibleIndex];
        if (target.role !== "user") {
            return reply.status(400).send({ error: "VALIDATION_ERROR", details: "Only user messages can be edited/restarted" });
        }
        if (memoryService) {
            const toFlush = visibleEntries
                .slice(targetVisibleIndex)
                .filter((entry) => entry.content.trim().length > 0)
                .map((entry) => `[${entry.role}] ${entry.content}`);
            await memoryService.flushPreCompaction(sessionId, toFlush);
        }
        const truncatedHistory = history.slice(0, target.historyIndex);
        sessionHistory.set(sessionId, truncatedHistory);
        if (db) {
            const rows = db
                .select()
                .from(messagesTable)
                .where(eq(messagesTable.sessionId, sessionId))
                .orderBy(messagesTable.createdAt)
                .all();
            const rowsToDelete = rows.slice(targetVisibleIndex);
            for (const row of rowsToDelete) {
                db.delete(messagesTable).where(eq(messagesTable.id, row.id)).run();
            }
        }
        try {
            sessionService?.touch(sessionId);
        }
        catch { /* ignore */ }
        const updatedMessages = buildVisibleHistoryMessages(sessionId, truncatedHistory);
        const windowed = windowMessages(updatedMessages, DEFAULT_UI_MESSAGE_LIMIT);
        return {
            ok: true,
            sessionId,
            streaming: false,
            total: windowed.total,
            hasMore: windowed.hasMore,
            limit: DEFAULT_UI_MESSAGE_LIMIT,
            messages: windowed.messages,
        };
    });
    // List messages in a session
    app.get("/api/sessions/:sessionId/messages", async (request, reply) => {
        const authUser = await requireAuth(request, reply, config.jwtSecret);
        if (!authUser)
            return;
        const { sessionId } = request.params;
        if (sessionService) {
            const session = sessionService.getById(sessionId, authUser.id);
            if (!session) {
                return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
            }
        }
        const query = request.query;
        const limit = parseMessageLimit(query?.limit);
        hydrateSession(sessionId);
        const history = sessionHistory.get(sessionId) ?? [];
        const visible = buildVisibleHistoryMessages(sessionId, history);
        const windowed = windowMessages(visible, limit);
        return {
            sessionId,
            streaming: activeStreams.has(sessionId),
            total: windowed.total,
            hasMore: windowed.hasMore,
            limit,
            messages: windowed.messages,
        };
    });
    // SSE stream-resume: join an in-progress session's token stream
    // Client receives a snapshot of current content, then live tokens until done.
    app.get("/api/sessions/:sessionId/stream", async (request, reply) => {
        const authUser = await requireAuth(request, reply, config.jwtSecret);
        if (!authUser)
            return;
        const { sessionId } = request.params;
        if (sessionService) {
            const session = sessionService.getById(sessionId, authUser.id);
            if (!session) {
                return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
            }
        }
        const query = request.query;
        const limit = parseMessageLimit(query?.limit);
        reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        });
        hydrateSession(sessionId);
        const history = sessionHistory.get(sessionId) ?? [];
        const isStreaming = activeStreams.has(sessionId);
        // Build snapshot. While streaming, prefer in-memory history so partial assistant
        // content is visible immediately (DB persistence may lag until stream completion).
        let snapshotMessages;
        let total = 0;
        let hasMore = false;
        if (db && !isStreaming) {
            const rows = db
                .select()
                .from(messagesTable)
                .where(eq(messagesTable.sessionId, sessionId))
                .orderBy(messagesTable.createdAt)
                .all();
            const allMessages = rows
                .filter((r) => r.role === "user" || r.role === "assistant")
                .map((r, i) => {
                const msg = {
                    id: `${sessionId}-${i}`,
                    role: r.role,
                    content: r.content,
                };
                if (r.toolCalls) {
                    try {
                        msg.toolCalls = JSON.parse(r.toolCalls);
                    }
                    catch { /* ignore */ }
                }
                if (r.segments) {
                    try {
                        msg.segments = JSON.parse(r.segments);
                    }
                    catch { /* ignore */ }
                }
                return msg;
            });
            const windowed = windowMessages(allMessages, limit);
            snapshotMessages = windowed.messages;
            total = windowed.total;
            hasMore = windowed.hasMore;
        }
        else {
            const allMessages = buildVisibleHistoryMessages(sessionId, history, { includePendingAssistantToolCalls: isStreaming });
            const windowed = windowMessages(allMessages, limit);
            snapshotMessages = windowed.messages;
            total = windowed.total;
            hasMore = windowed.hasMore;
        }
        reply.raw.write(`data: ${JSON.stringify({
            type: "snapshot",
            messages: snapshotMessages,
            streaming: isStreaming,
            total,
            hasMore,
            limit,
        })}\n\n`);
        if (!isStreaming) {
            // Not streaming — send done immediately
            reply.raw.write(`data: ${JSON.stringify({ type: "done", session_id: sessionId, prompt_count: history.filter(m => m.role === "user").length, remaining_prompts: null })}\n\n`);
            reply.raw.end();
            return;
        }
        // Subscribe to live events
        let closed = false;
        let unsubscribe = () => { };
        const closeStream = () => {
            if (closed)
                return;
            closed = true;
            unsubscribe();
            try {
                reply.raw.end();
            }
            catch { /* already closed */ }
        };
        reply.raw.on("close", () => {
            closeStream();
        });
        unsubscribe = subscribe(sessionId, (event) => {
            if (closed)
                return;
            try {
                reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
                if (event.type === "done" || event.type === "error") {
                    closeStream();
                }
            }
            catch {
                closeStream();
            }
        });
        // Clean up subscription if client disconnects before stream finishes
        request.raw.on("close", () => {
            closeStream();
        });
    });
    // ── POST /api/sessions/:sessionId/retry-tool ────────────────────────
    // Retry a specific failed tool call by its callId.
    app.post("/api/sessions/:sessionId/retry-tool", async (request, reply) => {
        const authUser = await requireAuth(request, reply, config.jwtSecret);
        if (!authUser)
            return;
        const { sessionId } = request.params;
        if (sessionService) {
            const session = sessionService.getById(sessionId, authUser.id);
            if (!session) {
                return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
            }
        }
        const body = request.body ?? {};
        const callId = typeof body["callId"] === "string" ? body["callId"] : "";
        if (!callId) {
            return reply.status(400).send({ error: "VALIDATION_ERROR", details: "callId is required" });
        }
        // Cannot retry while a stream is active
        if (activeStreams.has(sessionId)) {
            return reply.status(409).send({ error: "CONFLICT", details: "Cannot retry while session is streaming" });
        }
        const executed = sessionExecutedToolCalls.get(sessionId);
        if (!executed) {
            return reply.status(404).send({ error: "NOT_FOUND", details: "No tool calls recorded for this session" });
        }
        const original = executed.find((tc) => tc.callId === callId);
        if (!original) {
            return reply.status(404).send({ error: "NOT_FOUND", details: `Tool call ${callId} not found` });
        }
        hydrateSession(sessionId);
        const history = sessionHistory.get(sessionId);
        if (!history) {
            return reply.status(404).send({ error: "NOT_FOUND", details: "Session history not found" });
        }
        const userApiKeys = userService?.getSettings(authUser.id).apiKeys ?? {};
        const result = await retryToolCall(callId, history, executed, executeTool, sessionId, { userId: authUser.id, apiKeys: userApiKeys }, (event) => emitToSubscribers(sessionId, event));
        // Persist updated history entry
        if (db) {
            const tcJson = JSON.stringify(executed);
            // Find the last assistant message and update its tool calls
            const rows = db
                .select()
                .from(messagesTable)
                .where(eq(messagesTable.sessionId, sessionId))
                .orderBy(messagesTable.createdAt)
                .all();
            const lastAssistant = [...rows].reverse().find((r) => r.role === "assistant");
            if (lastAssistant) {
                db.update(messagesTable)
                    .set({ toolCalls: tcJson })
                    .where(eq(messagesTable.id, lastAssistant.id))
                    .run();
            }
        }
        return {
            ok: result.ok,
            callId,
            tool: original.tool,
            message: result.message,
            data: result.data,
            retryCount: original.retryCount,
        };
    });
    // ── POST /api/sessions/:sessionId/steer ─────────────────────────────
    // Inject a steering message into an active agent loop.
    app.post("/api/sessions/:sessionId/steer", async (request, reply) => {
        const authUser = await requireAuth(request, reply, config.jwtSecret);
        if (!authUser)
            return;
        const { sessionId } = request.params;
        if (sessionService) {
            const session = sessionService.getById(sessionId, authUser.id);
            if (!session) {
                return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
            }
        }
        const body = request.body ?? {};
        const message = typeof body["message"] === "string" ? body["message"] : "";
        if (!message.trim()) {
            return reply.status(400).send({ error: "VALIDATION_ERROR", details: "message is required" });
        }
        if (!activeStreams.has(sessionId)) {
            return reply.status(409).send({ error: "CONFLICT", details: "No active stream for this session — steering only works during streaming" });
        }
        const controller = sessionSteeringControllers.get(sessionId);
        if (!controller) {
            return reply.status(404).send({ error: "NOT_FOUND", details: "No steering controller for this session" });
        }
        controller.steer(message);
        return { ok: true, steered: true };
    });
    // ══ GET /api/sessions/:sessionId/plan — Get pending plan ═══════════
    app.get("/api/sessions/:sessionId/plan", async (request, reply) => {
        const authUser = await requireAuth(request, reply, config.jwtSecret);
        if (!authUser)
            return;
        const { sessionId } = request.params;
        if (sessionService) {
            const session = sessionService.getById(sessionId, authUser.id);
            if (!session) {
                return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
            }
        }
        const plan = sessionPlans.get(sessionId);
        if (!plan) {
            return reply.status(404).send({ error: "NOT_FOUND", details: "No pending plan for this session" });
        }
        return {
            plan_id: plan.id,
            summary: plan.summary,
            actions: plan.actions.map((a) => ({
                id: a.id,
                tool: a.tool,
                args: a.args,
                description: a.description,
                order: a.order,
                status: a.status,
            })),
        };
    });
    // ══ POST /api/sessions/:sessionId/plan/execute — Execute approved plan ═
    app.post("/api/sessions/:sessionId/plan/execute", async (request, reply) => {
        const authUser = await requireAuth(request, reply, config.jwtSecret);
        if (!authUser)
            return;
        const { sessionId } = request.params;
        if (sessionService) {
            const session = sessionService.getById(sessionId, authUser.id);
            if (!session) {
                return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
            }
        }
        const plan = sessionPlans.get(sessionId);
        if (!plan) {
            return reply.status(404).send({ error: "NOT_FOUND", details: "No pending plan for this session" });
        }
        const body = request.body ?? {};
        // Optional: allow partial approval by specifying action IDs to execute
        const approvedActionIds = Array.isArray(body["action_ids"])
            ? new Set(body["action_ids"].filter((id) => typeof id === "string"))
            : null;
        const userApiKeys = userService?.getSettings(authUser.id).apiKeys ?? {};
        // SSE headers for streaming plan execution
        reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        });
        let clientDisconnected = false;
        reply.raw.on("close", () => { clientDisconnected = true; });
        const safeWrite = (data) => {
            if (!clientDisconnected) {
                try {
                    reply.raw.write(data);
                }
                catch {
                    clientDisconnected = true;
                }
            }
        };
        const executionResults = [];
        for (const action of plan.actions) {
            // Skip rejected or already-executed actions
            if (action.status === "rejected" || action.status === "executed")
                continue;
            // If partial approval, skip non-approved
            if (approvedActionIds && !approvedActionIds.has(action.id)) {
                action.status = "rejected";
                continue;
            }
            action.status = "approved";
            safeWrite(`data: ${JSON.stringify({ type: "plan_action_start", id: action.id, tool: action.tool, order: action.order })}\n\n`);
            emitToSubscribers(sessionId, { type: "tool_start", tool: action.tool, args: action.args, call_id: action.id });
            try {
                const result = await executeTool(action.tool, action.args, sessionId, { userId: authUser.id, apiKeys: userApiKeys }, (chunk) => {
                    safeWrite(`data: ${JSON.stringify({ type: "plan_action_output", id: action.id, content: chunk })}\n\n`);
                });
                action.status = result.ok ? "executed" : "failed";
                action.result = { ok: result.ok, message: result.message, data: result.data };
                executionResults.push({ id: action.id, tool: action.tool, ok: result.ok, message: result.message, data: result.data });
                safeWrite(`data: ${JSON.stringify({
                    type: "plan_action_result",
                    id: action.id,
                    tool: action.tool,
                    ok: result.ok,
                    message: result.message,
                    data: result.data,
                })}\n\n`);
                emitToSubscribers(sessionId, {
                    type: "tool_result",
                    call_id: action.id,
                    tool: action.tool,
                    ok: result.ok,
                    message: result.message,
                    data: result.data,
                });
                // Add to conversation history so the agent has context
                const history = sessionHistory.get(sessionId);
                if (history) {
                    history.push({
                        role: "tool",
                        content: JSON.stringify({ ok: result.ok, message: result.message, data: result.data }),
                        tool_call_id: action.id,
                        name: action.tool,
                    });
                }
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                action.status = "failed";
                action.result = { ok: false, message };
                executionResults.push({ id: action.id, tool: action.tool, ok: false, message });
                safeWrite(`data: ${JSON.stringify({ type: "plan_action_result", id: action.id, tool: action.tool, ok: false, message })}\n\n`);
            }
        }
        // Plan fully executed — clean up
        const allDone = plan.actions.every((a) => a.status === "executed" || a.status === "rejected" || a.status === "failed");
        if (allDone) {
            sessionPlans.delete(sessionId);
        }
        const succeeded = executionResults.filter((r) => r.ok).length;
        const failed = executionResults.filter((r) => !r.ok).length;
        safeWrite(`data: ${JSON.stringify({
            type: "plan_execution_complete",
            plan_id: plan.id,
            total: executionResults.length,
            succeeded,
            failed,
            results: executionResults,
        })}\n\n`);
        reply.raw.end();
    });
    // ══ POST /api/sessions/:sessionId/plan/reject — Reject/discard plan ═
    app.post("/api/sessions/:sessionId/plan/reject", async (request, reply) => {
        const authUser = await requireAuth(request, reply, config.jwtSecret);
        if (!authUser)
            return;
        const { sessionId } = request.params;
        if (sessionService) {
            const session = sessionService.getById(sessionId, authUser.id);
            if (!session) {
                return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
            }
        }
        const plan = sessionPlans.get(sessionId);
        if (!plan) {
            return reply.status(404).send({ error: "NOT_FOUND", details: "No pending plan for this session" });
        }
        for (const action of plan.actions) {
            if (action.status === "pending")
                action.status = "rejected";
        }
        sessionPlans.delete(sessionId);
        // Add a system message so the agent knows the plan was rejected
        const history = sessionHistory.get(sessionId);
        if (history) {
            history.push({
                role: "system",
                content: "[PLAN REJECTED] The user rejected the proposed plan. Ask if they want to revise it or try a different approach.",
            });
        }
        return { ok: true, plan_id: plan.id, message: "Plan rejected and discarded." };
    });
}
// ══════════════════════════════════════════════════════════════════════
// Agent loop extracted to ../tools/agent-loop.ts
// (runAgentLoop, parseOpenAIStream, serializeMessages, etc.)
// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// Ollama streaming (text-only — no tool support)
// ══════════════════════════════════════════════════════════════════════
async function runOllamaStream(config, history, sessionId, streamAbort, safeWrite, app) {
    let fullContent = "";
    const ollamaResponse = await fetch(`${config.ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: config.ollamaModel,
            messages: history
                .filter(m => m.role !== "tool")
                .map(m => ({ role: m.role, content: m.content })),
            stream: true,
        }),
        signal: streamAbort.signal,
    });
    if (!ollamaResponse.ok) {
        const errText = await ollamaResponse.text();
        app.log.error(`Ollama error ${ollamaResponse.status}: ${errText}`);
        safeWrite(`data: ${JSON.stringify({ type: "error", message: `Ollama error: ${ollamaResponse.status}` })}\n\n`);
        return fullContent;
    }
    const reader = ollamaResponse.body?.getReader();
    if (!reader) {
        safeWrite(`data: ${JSON.stringify({ type: "error", message: "No response body from Ollama" })}\n\n`);
        return fullContent;
    }
    const decoder = new TextDecoder();
    let buffer = "";
    let streamingAssistantIndex = null;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const chunk = JSON.parse(line);
                if (chunk.message?.content) {
                    const token = chunk.message.content;
                    fullContent += token;
                    // Keep in-memory history updated during streaming so endpoints can
                    // return a partial assistant response mid-stream.
                    if (streamingAssistantIndex === null) {
                        history.push({ role: "assistant", content: "" });
                        streamingAssistantIndex = history.length - 1;
                    }
                    history[streamingAssistantIndex].content += token;
                    emitToSubscribers(sessionId, { type: "token", content: token });
                    safeWrite(`data: ${JSON.stringify({ type: "token", content: token })}\n\n`);
                }
            }
            catch {
                // partial JSON
            }
        }
    }
    if (fullContent) {
        persistMessageGlobal(sessionId, "assistant", fullContent);
    }
    return fullContent;
}
//# sourceMappingURL=chat.js.map