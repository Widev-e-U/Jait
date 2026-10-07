import type { TeamMessageKind } from "@jait/shared";
import { type TeamChatService } from "../services/team-chat.js";
import type { SessionService } from "../services/sessions.js";
import type { UserService } from "../services/users.js";
import type { ToolDefinition } from "./contracts.js";
import { uuidv7 } from "../db/uuidv7.js";

interface TeamChatInput {
  action: "list" | "get" | "send" | "goal" | "complete";
  roomId?: string;
  agentId?: string;
  content?: string;
  recipientIds?: string[];
  kind?: TeamMessageKind;
  clientKey?: string;
  targetSessionId?: string;
  criteria?: string[];
  evidence?: string[];
}
export function createTeamChatTool(service: TeamChatService, _sessions: SessionService, users?: UserService): ToolDefinition<TeamChatInput> {
  return {
    name: "team.chat", displayName: "Team group chat", page: "agents", tier: "standard", category: "agent", source: "builtin",
    risk: "medium", defaultConsentLevel: "once",
    description: "Read persistent hierarchy team rooms, relay the user's instructions from this chat, and coordinate with named agents. Normal chats speak as a neutral gray-circle chat persona with their source chat name. Agent work chats speak as their saved agent identity. Address recipientIds for handoffs; Jait runs assignments, questions and reviews in persona-linked Threads. Agent discussion, result, verification and blocked messages are passive updates even when addressed. Use kind=assignment, question or review only for new work; avoid acknowledgement handoffs. Do not start agents yourself. Set a goal with criteria and close it only with evidence and independent verification.",
    discovery: { aliases: ["team room", "group chat", "handoff", "tell the team", "relay to agents"], examples: ["Tell the developer team what Jakob asked", "Ask QA to review my implementation"] },
    parameters: { type: "object", properties: {
      action: { type: "string", enum: ["list", "get", "send", "goal", "complete"] },
      roomId: { type: "string" }, agentId: { type: "string", description: "A member of the hierarchy, used to find/create its persistent room." },
      content: { type: "string" }, recipientIds: { type: "array", items: { type: "string" }, description: "Addressed members to wake. Omit on user relays to choose the best member automatically; use [] for a passive update." },
      kind: { type: "string", enum: ["discussion", "assignment", "question", "review", "result", "verification", "blocked", "relay"] },
      targetSessionId: { type: "string", description: "Steer this existing thread or legacy work chat instead of creating new execution. Recipient must own that work in this room." },
      clientKey: { type: "string", description: "Retain this key on retries to avoid duplicate messages and handoffs." },
      criteria: { type: "array", items: { type: "string" } }, evidence: { type: "array", items: { type: "string" } },
    }, required: ["action"] },
    async execute(input, context) {
      if (!context.userId) return { ok: false, message: "Authenticated user required." };
      const userId = context.userId;
      try {
        if (input.action === "list") return { ok: true, message: "Persistent team rooms.", data: { rooms: service.list(userId) } };
        const work = service.workForSession(userId, context.sessionId);
        const roomId = input.roomId ?? work?.roomId ?? (input.agentId ? service.ensureRoom(userId, input.agentId, context.sessionId).id : undefined);
        if (!roomId) return { ok: false, message: "Choose a roomId from action=list or provide agentId." };
        const room = service.get(userId, roomId);
        if (input.action === "get") return { ok: true, message: room.name, data: { room, members: service.members(userId, room.rootAgentId), messages: service.history(userId, roomId), deliveries: service.deliveries(userId, roomId) } };
        const username = users?.findById(userId)?.username ?? "The user";
        const sender = service.sender(userId, context.sessionId, roomId);
        if (input.action === "goal") return { ok: true, message: "Team goal recorded.", data: { room: service.setGoal(userId, roomId, input.content ?? "", input.criteria ?? [], sender) } };
        if (input.action === "complete") return { ok: true, message: "Team goal completed with verification.", data: { room: service.completeGoal(userId, roomId, input.evidence ?? [], sender) } };
        if (input.action !== "send") return { ok: false, message: "Unknown team chat action." };
        if (!input.content?.trim()) return { ok: false, message: "Message content is required." };
        if (sender.kind === "chat") service.ensureRoom(userId, room.rootAgentId, context.sessionId);
        const message = await service.postRouted(userId, roomId, {
          sender, content: sender.kind === "chat" ? username + " said: " + (input.content ?? "") : (input.content ?? ""),
          kind: sender.kind === "chat" ? "relay" : input.kind,
          recipientIds: input.recipientIds, targetSessionId: input.targetSessionId, clientKey: input.clientKey ?? context.actionId ?? uuidv7(), parentMessageId: work?.messageId,
          workSessionId: work ? context.sessionId : undefined,
          workThreadId: service.threadById(userId, context.sessionId)?.id,
        });
        return { ok: true, message: "Posted to " + room.name + ".", data: { room, message, deliveries: service.deliveries(userId, roomId).filter(delivery => delivery.messageId === message.id),
          pageLinks: [{ pageId: "agents", title: room.name, href: "/agents" }] } };
      } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Unable to update team chat." }; }
    },
  };
}
