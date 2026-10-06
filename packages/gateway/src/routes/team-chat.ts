import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { requireAuth, signAuthToken } from "../security/http-auth.js";
import type { TeamChatService } from "../services/team-chat.js";
import type { UserService } from "../services/users.js";
import type { JaitDB } from "../db/connection.js";
import { messages } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";

const postSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
  attachments: z.array(z.object({ name: z.string().max(500), mimeType: z.string().max(200), data: z.string().max(8_000_000) })).max(10).optional(),
  clientKey: z.string().min(1).max(200),
  recipientIds: z.array(z.string()).max(10).optional(),
  targetSessionId: z.string().optional(),
  kind: z.enum(["discussion", "assignment", "question", "review", "result", "verification", "blocked", "relay"]).optional(),
});
export function registerTeamChatRoutes(app: FastifyInstance, config: AppConfig, service: TeamChatService, db: JaitDB, users: UserService) {
  service.setDecisionKeys(userId => users.getSettings(userId).apiKeys);
  service.setDispatcher(async (delivery, agent, prompt) => {
    const user = users.findById(service.owner(delivery.roomId));
    if (!user) throw new Error("Room owner unavailable.");
    const connectHost = config.host === "0.0.0.0" || config.host === "::" ? "127.0.0.1" : config.host;
    const headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret),
      host: (connectHost.includes(":") ? "[" + connectHost + "]" : connectHost) + ":" + config.port };
    const message = service.history(user.id, delivery.roomId).find(item => item.id === delivery.messageId)!;
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
