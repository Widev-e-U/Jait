import { getInternalChatRequestHeaders } from "../services/internal-chat-request.js";
import type { LightMyRequestResponse } from "fastify";
import { signAuthToken } from "../security/http-auth.js";
import { resolveThreadSelectionDefaults } from "../services/thread-defaults.js";
import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";
import type { ProjectMessageToolDeps } from "./project-message-tool.js";
import { waitForChatAcceptance } from "./project-chat-tool.js";

type ChatControlAction = "status" | "send" | "queue" | "steer" | "stop";
const ACTIONS: readonly ChatControlAction[] = ["status", "send", "queue", "steer", "stop"];

function errorDetail(response: LightMyRequestResponse): string {
  try {
    const body = response.json() as { details?: unknown; error?: unknown };
    return String(body.details ?? body.error ?? response.body).slice(0, 2000);
  } catch { return response.body.slice(0, 2000); }
}

/**
 * Control another existing chat of the same user through the normal chat
 * routes, so ownership, queueing, steering and cancellation semantics stay
 * identical to the user acting in that chat's UI.
 */
export function createChatControlTool(deps: Pick<ProjectMessageToolDeps, "sessionService" | "sessionState" | "userService" | "config" | "getApp">): ToolDefinition {
  return {
    name: "chat.control",
    displayName: "Control Chat",
    page: "chat",
    description: "Inspect or control ANOTHER existing chat of the user by sessionId. Actions: status (is a turn running, queued messages, loop state); "
      + "send (start a turn now; refused while that chat is busy); queue (add to that chat's queue, or start now when idle); "
      + "steer (inject guidance into the turn that is running now); stop (cancel the running turn; a running goal loop is paused). "
      + "Messages run on the provider, model and effort already selected in that chat. Cannot target the current chat. Find chat IDs with session.search or session.sql.",
    discovery: { aliases: ["message another chat", "steer other chat", "stop other chat", "queue message in chat", "send to existing chat"], capabilities: ["send, queue, steer or stop messages in another existing chat"] },
    tier: "standard", category: "gateway", source: "builtin", risk: "medium", defaultConsentLevel: "once",
    parameters: { type: "object", properties: {
      action: { type: "string", enum: [...ACTIONS], description: "status, send, queue, steer or stop." },
      sessionId: { type: "string", description: "Target chat (session) ID. Must differ from the current chat." },
      message: { type: "string", maxLength: 100_000, description: "Exact message text for send, queue or steer." },
    }, required: ["action", "sessionId"] },
    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
      if (context.signal?.aborted) return { ok: false, message: "Chat control was cancelled before it started." };
      const body = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
      const action = body.action as ChatControlAction;
      if (!ACTIONS.includes(action)) return { ok: false, message: `action must be one of ${ACTIONS.join(", ")}.` };
      const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
      if (!sessionId) return { ok: false, message: "sessionId is required." };
      if (sessionId === context.sessionId) return { ok: false, message: "chat.control cannot target the current chat." };
      const message = typeof body.message === "string" ? body.message : "";
      const needsMessage = action === "send" || action === "queue" || action === "steer";
      if (needsMessage && !message.trim()) return { ok: false, message: `message is required for ${action}.` };
      if (message.length > 100_000) return { ok: false, message: "message exceeds 100,000 characters." };
      const userId = context.userId?.trim();
      if (!userId) return { ok: false, message: "An authenticated user is required." };
      const app = deps.getApp?.();
      const user = deps.userService?.findById(userId);
      if (!app || !user || !deps.config) return { ok: false, message: "The chat service is unavailable." };
      const session = deps.sessionService.getById(sessionId, userId);
      if (!session) return { ok: false, message: `Chat ${sessionId} not found.` };
      const href = `/chat?sessionId=${encodeURIComponent(sessionId)}`;
      const pageLinks = [{ pageId: "chat", title: `Open ${session.name ?? "chat"}`, href }];
      const base = { sessionId, name: session.name, href, pageLinks };

      const token = await signAuthToken({ id: user.id, username: user.username }, deps.config.jwtSecret);
      const headers = getInternalChatRequestHeaders(deps.config, token);
      const sessionUrl = `/api/sessions/${encodeURIComponent(sessionId)}`;
      const runtime = async () => {
        const response = await app.inject({ method: "GET", url: `${sessionUrl}/runtime`, headers });
        return response.statusCode === 200 ? response.json() as { running: boolean; startedAt: string | null } : undefined;
      };

      if (action === "status") {
        const state = await runtime();
        if (!state) return { ok: false, message: "Could not read the chat's runtime state.", data: base };
        const queue = deps.sessionState?.get(sessionId, ["queued_messages"]).queued_messages;
        const queued = Array.isArray(queue) ? queue.map(item => ({ id: (item as { id?: unknown }).id, content: String((item as { content?: unknown }).content ?? "").slice(0, 200) })) : [];
        let loop: unknown;
        try { loop = (JSON.parse(session.metadata ?? "{}") as { loop?: { status?: unknown; iteration?: unknown; goal?: unknown } }).loop; } catch { /* malformed metadata */ }
        const loopState = loop && typeof loop === "object"
          ? { status: (loop as { status?: unknown }).status, iteration: (loop as { iteration?: unknown }).iteration } : null;
        return { ok: true, message: state.running ? "A turn is running in that chat." : "That chat is idle.", data: { ...base, ...state, queued, loop: loopState } };
      }

      if (action === "stop") {
        const response = await app.inject({ method: "POST", url: `${sessionUrl}/cancel`, headers, payload: {} });
        if (response.statusCode !== 200) return { ok: false, message: `Stop was rejected (HTTP ${response.statusCode}): ${errorDetail(response)}`, data: base };
        const cancelled = (response.json() as { cancelled?: boolean }).cancelled === true;
        return { ok: true, message: cancelled ? "Stopped the running turn; a running goal loop was paused." : "No turn was running; a running goal loop was paused.", data: { ...base, cancelled } };
      }

      if (action === "steer") {
        const response = await app.inject({ method: "POST", url: `${sessionUrl}/steer`, headers, payload: { message } });
        if (response.statusCode !== 200) return { ok: false, message: `Steering was rejected (HTTP ${response.statusCode}): ${errorDetail(response)}. Use queue or send instead when the chat is idle.`, data: base };
        const result = response.json() as { queuedMessageId?: string; turnId?: string };
        return { ok: true, message: "Steering accepted; the running turn picks it up at its next step.", data: { ...base, queuedMessageId: result.queuedMessageId, turnId: result.turnId } };
      }

      if (action === "send" && (await runtime())?.running) {
        return { ok: false, message: "That chat is running a turn. Use steer to redirect it, queue to run after it, or stop first.", data: { ...base, accepted: false } };
      }
      // Only the selection the user made in the target chat is used.
      const selection = resolveThreadSelectionDefaults({ sessionId, sessionState: deps.sessionState });
      if (!selection.providerId) return { ok: false, message: "That chat has no recorded provider selection; open it and choose one first.", data: { ...base, accepted: false } };
      if (context.signal?.aborted) return { ok: false, message: "Submission was cancelled before it started.", data: { ...base, accepted: false } };
      try {
        const response = await app.inject({ method: "POST", url: "/api/chat", headers, payloadAsStream: true,
          payload: { sessionId, content: message, provider: selection.providerId, ...(selection.model ? { model: selection.model } : {}),
            ...(selection.runtimeMode ? { runtimeMode: selection.runtimeMode } : {}), ...(selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}) } });
        const stream = response.stream();
        if (response.statusCode !== 200 && response.statusCode !== 202) {
          let detail = "";
          for await (const chunk of stream) detail = (detail + String(chunk)).slice(0, 2000);
          return { ok: false, message: `The message was rejected (HTTP ${response.statusCode}): ${detail}`, data: { ...base, accepted: false } };
        }
        const queued = response.statusCode === 202;
        if (!await waitForChatAcceptance(stream, queued, context.signal)) return { ok: false, message: "Submission status is unknown. Check the chat with status before retrying.", data: { ...base, accepted: null } };
        return { ok: true, message: queued ? "Queued; it runs after that chat's current turn." : "Started a turn in that chat.", data: { ...base, accepted: true, queued } };
      } catch {
        return { ok: false, message: "Submission status is unknown. Check the chat with status before retrying.", data: { ...base, accepted: null } };
      }
    },
  };
}
