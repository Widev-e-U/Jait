import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { requireAuth, signAuthToken } from "../security/http-auth.js";
import type { TeamChatService } from "../services/team-chat.js";
import type { UserService } from "../services/users.js";
import type { JaitDB } from "../db/connection.js";
import { messages } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import type { ThreadService } from "../services/threads.js";
import { GitService } from "../services/git.js";
import { prepareDeliveryWorktree } from "../tools/thread-tools.js";
import { setTimeout as delay } from "node:timers/promises";

const postSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
  attachments: z.array(z.object({ name: z.string().max(500), mimeType: z.string().max(200), data: z.string().max(8_000_000) })).max(10).optional(),
  clientKey: z.string().min(1).max(200),
  recipientIds: z.array(z.string()).max(10).optional(),
  targetSessionId: z.string().optional(),
  kind: z.enum(["discussion", "assignment", "question", "review", "result", "verification", "blocked", "relay"]).optional(),
});
export function registerTeamChatRoutes(app: FastifyInstance, config: AppConfig, service: TeamChatService, db: JaitDB, users: UserService, threads: ThreadService) {
  service.setDecisionKeys(userId => users.getSettings(userId).apiKeys);
  service.setDispatcher(async (delivery, agent, prompt) => {
    const user = users.findById(service.owner(delivery.roomId));
    if (!user) throw new Error("Room owner unavailable.");
    const connectHost = config.host === "0.0.0.0" || config.host === "::" ? "127.0.0.1" : config.host;
    const headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret),
      host: (connectHost.includes(":") ? "[" + connectHost + "]" : connectHost) + ":" + config.port };
    const message = service.history(user.id, delivery.roomId).find(item => item.id === delivery.messageId)!;
    let thread = service.threadById(user.id, delivery.sessionId);
    if (thread) {
      try {
        if (!thread.workingDirectory) throw new Error("Assign a project or repository before running team work.");
        thread = await prepareDeliveryWorktree(thread, threads, new GitService());
        if (service.isClosed()) return { content: "", delivered: true };
        const previousActivityIds = new Set(service.threadActivities(user.id, thread.id).map(activity => activity.id));
        const payload = {
          titleTask: "", // The addressed message already supplies a meaningful title.
          message: (service.context(user.id, thread.id) ?? "") + "\n\n" + prompt,
          displayContent: message.sender.name + ": " + message.content,
          // Thread routes consume composer segments; preserve attachments without filesystem writes.
          displaySegments: [{ type: "text", text: message.sender.name + ": " + message.content },
            ...(message.attachments ?? []).map(file => ({
              ...file, type: file.mimeType.startsWith("image/") ? "image" : "attachment",
            }))],
        };
        const operation = thread.status === "running" ? "steer" : thread.providerSessionId ? "send" : "start";
        const response = await app.inject({ method: "POST", url: "/api/threads/" + encodeURIComponent(thread.id) + "/" + operation, headers, payload });
        if (response.statusCode >= 400) throw new Error("Thread delivery failed (" + response.statusCode + "): " + response.body.slice(0, 500));
        if (operation === "steer") return { content: "", delivered: true };
        // /start returns as soon as execution is scheduled. Completion must reflect the real turn.
        while (!service.isClosed()) {
          const current = service.threadById(user.id, thread.id);
          if (!current) throw new Error("Work thread was deleted.");
          if (current.status === "error" || current.status === "interrupted") throw new Error(current.error ?? "Thread interrupted.");
          if (current.status === "completed") {
            const answer = service.threadActivities(user.id, thread.id)
              .filter(activity => !previousActivityIds.has(activity.id) && activity.kind === "message" &&
                (activity.payload as { role?: string } | undefined)?.role === "assistant").at(-1);
            return { content: (answer?.payload as { content?: string } | undefined)?.content ?? "" };
          }
          await delay(100);
        }
        return { content: "", delivered: true };
      } catch (error) {
        if (!service.isClosed() && threads.getById(thread.id)?.status === "idle") {
          threads.markError(thread.id, error instanceof Error ? error.message : String(error));
        }
        throw error;
      }
    }
    // Legacy explicit targets remain chats so already-running work is never duplicated.
    if (message.targetSessionId) {
      const steer = await app.inject({ method: "POST", url: "/api/sessions/" + encodeURIComponent(delivery.sessionId) + "/steer", headers,
        payload: { message: prompt, displayContent: message.sender.name + ": " + message.content } });
      if (steer.statusCode < 400) return { content: "", delivered: true };
      if (![404,409].includes(steer.statusCode)) throw new Error("Unable to steer work chat (" + steer.statusCode + ").");
    }
    const session = await app.inject({
      method: "POST", url: "/api/chat", headers,
      payload: { sessionId: delivery.sessionId, content: prompt, mode: "agent", provider: agent.providerId, model: agent.model ?? undefined,
        attachments: message.attachments, runtimeMode: agent.requiresApproval ? "supervised" : "full-access", queuedMessageId: delivery.id },
    });
    if (session.statusCode >= 400) throw new Error("Work chat failed (" + session.statusCode + "): " + session.body.slice(0, 500));
    if (session.statusCode === 202) return { content: "", delivered: true };
    if (/"type"\s*:\s*"error"/.test(session.body)) throw new Error("Work chat reported an error. Open its conversation for details.");
    const result = db.select().from(messages).where(eq(messages.sessionId, delivery.sessionId)).orderBy(desc(messages.id)).all().find(message => message.role === "assistant");
    return { content: result?.content ?? "" };
  });
  app.get("/api/team-rooms", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret); if (!user) return;
    return { rooms: service.list(user.id) };
  });
  app.post("/api/team-rooms", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret); if (!user) return;
    const body = z.object({ agentId: z.string().min(1), sourceSessionId: z.string().optional() }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Invalid room request." });
    try { return { room: service.ensureRoom(user.id, body.data.agentId, body.data.sourceSessionId) }; }
    catch (error) { return reply.status(400).send({ error: String(error) }); }
  });
  app.get<{ Params: { id: string } }>("/api/team-rooms/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret); if (!user) return;
    try {
      const room = service.get(user.id, request.params.id);
      return { room, members: service.members(user.id, room.rootAgentId), messages: service.history(user.id, room.id), deliveries: service.deliveries(user.id, room.id) };
    } catch { return reply.status(404).send({ error: "Team room not found." }); }
  });
  app.post<{ Params: { id: string } }>("/api/team-rooms/:id/messages", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret); if (!user) return;
    const body = postSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Invalid team message." });
    try {
      const message = await service.postRouted(user.id, request.params.id, { ...body.data, sender: { kind: "user", id: user.id, name: user.username, avatar: null } });
      return reply.status(201).send({ message });
    } catch (error) { return reply.status(400).send({ error: error instanceof Error ? error.message : "Unable to post." }); }
  });
  app.addHook("onReady", async () => { await service.recover(); });
  app.addHook("onClose", async () => { service.close(); });
}
