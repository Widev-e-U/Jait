/**
 * Agent Thread REST + WS routes.
 *
 * Manages parallel agent threads — each thread is an independent agent
 * session running on a specific provider (jait, codex, claude-code).
 *
 *   GET    /api/threads              — list threads
 *   POST   /api/threads              — create thread
 *   GET    /api/threads/:id          — get thread
 *   PATCH  /api/threads/:id          — update thread
 *   DELETE /api/threads/:id          — delete thread
 *   POST   /api/threads/:id/start    — start agent session
 *   POST   /api/threads/:id/send     — send a turn
 *   POST   /api/threads/:id/stop     — stop agent session
 *   POST   /api/threads/:id/interrupt — interrupt current turn
 *   POST   /api/threads/:id/approve  — approve a tool call
 *   GET    /api/threads/:id/activities — get activity log
 *   GET    /api/providers            — list available providers
 */

import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { ThreadService } from "../services/threads.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { WsControlPlane } from "../ws.js";
import { requireAuth } from "../security/http-auth.js";
import type { ProviderEvent, ProviderId } from "../providers/contracts.js";
import type { WsEventType } from "@jait/shared";

export interface ThreadRouteDeps {
  threadService: ThreadService;
  providerRegistry: ProviderRegistry;
  ws?: WsControlPlane;
}

export function registerThreadRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: ThreadRouteDeps,
): void {
  const { threadService, providerRegistry, ws } = deps;

  // ── Helpers ──────────────────────────────────────────────────────

  /** Broadcast a thread event over WS to all clients */
  function broadcastThreadEvent(
    threadId: string,
    event: string,
    data: unknown,
  ): void {
    if (!ws) return;
    ws.broadcastAll({
      type: `thread.${event}` as WsEventType,
      sessionId: "", // thread events are global
      timestamp: new Date().toISOString(),
      payload: { threadId, ...data as Record<string, unknown> },
    });
  }

  // ── CRUD Routes ──────────────────────────────────────────────────

  /** List threads (optionally filtered by sessionId) */
  app.get("/api/threads", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const query = request.query as Record<string, string>;
    const sessionId = query["sessionId"];
    const threads = sessionId
      ? threadService.listBySession(sessionId)
      : threadService.list(authUser.id);
    return { threads };
  });

  /** Create a new thread */
  app.post("/api/threads", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as Record<string, unknown>;
    const thread = threadService.create({
      userId: authUser.id,
      sessionId: typeof body["sessionId"] === "string" ? body["sessionId"] : undefined,
      title: typeof body["title"] === "string" ? body["title"] : "New Thread",
      providerId: (body["providerId"] as ProviderId) ?? "jait",
      model: typeof body["model"] === "string" ? body["model"] : undefined,
      runtimeMode: body["runtimeMode"] === "supervised" ? "supervised" : "full-access",
      workingDirectory: typeof body["workingDirectory"] === "string" ? body["workingDirectory"] : undefined,
      branch: typeof body["branch"] === "string" ? body["branch"] : undefined,
    });
    broadcastThreadEvent(thread.id, "created", { thread });
    return reply.status(201).send(thread);
  });

  /** Get thread by ID */
  app.get("/api/threads/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const thread = threadService.getById(id);
    if (!thread) return reply.status(404).send({ error: "Thread not found" });
    return thread;
  });

  /** Update thread (title, config, etc.) */
  app.patch("/api/threads/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const prState =
      body["prState"] === "open" || body["prState"] === "closed" || body["prState"] === "merged"
        ? body["prState"]
        : body["prState"] === null
          ? null
          : undefined;
    const thread = threadService.update(id, {
      title: typeof body["title"] === "string" ? body["title"] : undefined,
      model: typeof body["model"] === "string" ? body["model"] : undefined,
      runtimeMode: body["runtimeMode"] === "supervised" ? "supervised" : body["runtimeMode"] === "full-access" ? "full-access" : undefined,
      workingDirectory: typeof body["workingDirectory"] === "string" ? body["workingDirectory"] : undefined,
      branch: typeof body["branch"] === "string" ? body["branch"] : undefined,
      prUrl: typeof body["prUrl"] === "string" ? body["prUrl"] : body["prUrl"] === null ? null : undefined,
      prNumber: typeof body["prNumber"] === "number" ? body["prNumber"] : body["prNumber"] === null ? null : undefined,
      prTitle: typeof body["prTitle"] === "string" ? body["prTitle"] : body["prTitle"] === null ? null : undefined,
      prState,
    });
    if (!thread) return reply.status(404).send({ error: "Thread not found" });
    broadcastThreadEvent(id, "updated", { thread });
    return thread;
  });

  /** Delete thread */
  app.delete("/api/threads/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const existing = threadService.getById(id);
    if (!existing) return reply.status(404).send({ error: "Thread not found" });

    // Stop any running session first
    if (existing.status === "running" && existing.providerSessionId) {
      try {
        const provider = providerRegistry.get(existing.providerId as ProviderId);
        if (provider) await provider.stopSession(existing.providerSessionId);
      } catch { /* best effort */ }
    }

    threadService.delete(id);
    broadcastThreadEvent(id, "deleted", {});
    return reply.status(204).send();
  });

  // ── Lifecycle Routes ─────────────────────────────────────────────

  /** Start an agent session for this thread */
  app.post("/api/threads/:id/start", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const body = (request.body as Record<string, unknown>) ?? {};
    const thread = threadService.getById(id);
    if (!thread) return reply.status(404).send({ error: "Thread not found" });
    if (thread.status === "running") {
      return reply.status(409).send({ error: "Thread is already running" });
    }

    const providerId = thread.providerId as ProviderId;
    const provider = providerRegistry.get(providerId);
    if (!provider) {
      return reply.status(400).send({ error: `Provider '${providerId}' not registered` });
    }

    // Check availability
    const available = await provider.checkAvailability();
    if (!available) {
      return reply.status(503).send({
        error: `Provider '${providerId}' is not available: ${provider.info.unavailableReason}`,
      });
    }

    // Build MCP server references so CLI agents can call Jait's tools
    const mcpServers = [providerRegistry.buildJaitMcpServerRef(config)];

    try {
      const session = await provider.startSession({
        threadId: id,
        workingDirectory: thread.workingDirectory ?? process.cwd(),
        mode: (thread.runtimeMode as "full-access" | "supervised") ?? "full-access",
        model: thread.model ?? undefined,
        mcpServers,
      });

      // Subscribe to provider events and log them
      const unsubscribe = provider.onEvent((event: ProviderEvent) => {
        const activity = threadService.logProviderEvent(id, event);
        if (activity) {
          broadcastThreadEvent(id, "activity", { event, activity });
        }

        // Handle session completion
        if (event.type === "session.completed") {
          threadService.markCompleted(id);
          broadcastThreadEvent(id, "status", { status: "completed" });
          unsubscribe();
        } else if (event.type === "session.error") {
          threadService.markError(id, event.error);
          broadcastThreadEvent(id, "status", { status: "error", error: event.error });
          unsubscribe();
        }
      });

      threadService.markRunning(id, session.id);
      broadcastThreadEvent(id, "status", { status: "running" });

      // Send initial message if provided
      const message = typeof body["message"] === "string" ? body["message"] : undefined;
      if (message) {
        // Log the user's prompt as an activity so it shows in the thread
        const userActivity = threadService.addActivity(id, "message", message.slice(0, 500), { role: "user" });
        broadcastThreadEvent(id, "activity", { activity: userActivity });
        await provider.sendTurn(session.id, message);
      }

      const updated = threadService.getById(id);
      return reply.status(200).send(updated);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      threadService.markError(id, errorMsg);
      return reply.status(500).send({ error: errorMsg });
    }
  });

  /** Send a message/turn to a running thread */
  app.post("/api/threads/:id/send", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const message = typeof body["message"] === "string" ? body["message"] : "";
    const attachments = Array.isArray(body["attachments"]) ? body["attachments"] as string[] : undefined;

    const thread = threadService.getById(id);
    if (!thread) return reply.status(404).send({ error: "Thread not found" });
    if (thread.status !== "running" || !thread.providerSessionId) {
      return reply.status(409).send({ error: "Thread is not running" });
    }

    const provider = providerRegistry.get(thread.providerId as ProviderId);
    if (!provider) return reply.status(400).send({ error: `Provider '${thread.providerId}' not found` });

    await provider.sendTurn(thread.providerSessionId, message, attachments);

    const userActivity = threadService.addActivity(id, "message", message.slice(0, 500), { role: "user" });
    broadcastThreadEvent(id, "activity", { activity: userActivity });
    return reply.status(200).send({ ok: true });
  });

  /** Stop a running thread */
  app.post("/api/threads/:id/stop", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const thread = threadService.getById(id);
    if (!thread) return reply.status(404).send({ error: "Thread not found" });

    if (thread.providerSessionId) {
      const provider = providerRegistry.get(thread.providerId as ProviderId);
      if (provider) {
        try {
          await provider.stopSession(thread.providerSessionId);
        } catch { /* best effort */ }
      }
    }

    threadService.markInterrupted(id);
    broadcastThreadEvent(id, "status", { status: "interrupted" });
    return reply.status(200).send({ ok: true });
  });

  /** Interrupt the current turn in a running thread */
  app.post("/api/threads/:id/interrupt", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const thread = threadService.getById(id);
    if (!thread) return reply.status(404).send({ error: "Thread not found" });
    if (!thread.providerSessionId) {
      return reply.status(409).send({ error: "Thread has no active session" });
    }

    const provider = providerRegistry.get(thread.providerId as ProviderId);
    if (!provider) return reply.status(400).send({ error: `Provider '${thread.providerId}' not found` });

    await provider.interruptTurn(thread.providerSessionId);
    return reply.status(200).send({ ok: true });
  });

  /** Approve a tool call in supervised mode */
  app.post("/api/threads/:id/approve", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const requestId = typeof body["requestId"] === "string" ? body["requestId"] : "";
    const approved = body["approved"] !== false;

    const thread = threadService.getById(id);
    if (!thread) return reply.status(404).send({ error: "Thread not found" });
    if (!thread.providerSessionId) {
      return reply.status(409).send({ error: "Thread has no active session" });
    }

    const provider = providerRegistry.get(thread.providerId as ProviderId);
    if (!provider) return reply.status(400).send({ error: `Provider '${thread.providerId}' not found` });

    await provider.respondToApproval(thread.providerSessionId, requestId, approved);
    return reply.status(200).send({ ok: true });
  });

  // ── Activity log ─────────────────────────────────────────────────

  /** Get activities for a thread */
  app.get("/api/threads/:id/activities", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, string>;
    const limit = Math.min(parseInt(query["limit"] || "100", 10), 500);

    const thread = threadService.getById(id);
    if (!thread) return reply.status(404).send({ error: "Thread not found" });

    const activities = threadService.getActivities(id, limit);
    return { activities };
  });

  // ── Provider info ────────────────────────────────────────────────

  /** List available providers */
  app.get("/api/providers", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const providers = providerRegistry.list();
    // Check availability in parallel
    await Promise.all(
      providers.map((p) => p.checkAvailability().catch(() => false)),
    );

    return {
      providers: providers.map((p) => ({
        id: p.id,
        name: p.info.name,
        description: p.info.description,
        available: p.info.available,
        unavailableReason: p.info.unavailableReason,
        modes: p.info.modes,
      })),
    };
  });

  /** List models for a specific provider */
  app.get("/api/providers/:id/models", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const { id } = request.params as { id: string };
    const provider = providerRegistry.get(id as ProviderId);
    if (!provider) {
      return reply.status(404).send({ error: `Unknown provider: ${id}` });
    }

    if (!provider.listModels) {
      return { models: [] };
    }

    try {
      const models = await provider.listModels();
      return { models };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Failed to list models" });
    }
  });

  app.log.info("Agent thread routes registered at /api/threads");
}
