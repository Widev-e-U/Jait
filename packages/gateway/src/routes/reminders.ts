import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import type { ReminderService, ReminderStatus } from "../services/reminders.js";
import type { SessionService } from "../services/sessions.js";
import type { ThreadService } from "../services/threads.js";
import type { ProjectService } from "../services/projects.js";

export interface ReminderRouteDeps {
  reminderService: ReminderService;
  projectService?: ProjectService;
  sessionService?: SessionService;
  threadService?: ThreadService;
}

const validStatuses = new Set<ReminderStatus>(["active", "archived"]);

function parseLimit(value: unknown, fallback = 100): number {
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 500);
}

function normalizeTags(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean))]
    .slice(0, 20);
}

export function registerReminderRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: ReminderRouteDeps,
): void {
  const { reminderService, projectService, sessionService, threadService } = deps;

  app.get("/api/reminders", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const query = request.query as Record<string, unknown>;
    const statusValue = typeof query["status"] === "string" ? query["status"] : "active";
    const status = statusValue === "all" || validStatuses.has(statusValue as ReminderStatus)
      ? statusValue as ReminderStatus | "all"
      : "active";
    const projectId = typeof query["projectId"] === "string" && query["projectId"].trim()
      ? query["projectId"].trim()
      : undefined;
    const sessionId = typeof query["sessionId"] === "string" && query["sessionId"].trim()
      ? query["sessionId"].trim()
      : undefined;
    const limit = parseLimit(query["limit"]);

    const reminders = reminderService.list({
      userId: user.id,
      status,
      projectId,
      sessionId,
      limit,
    });
    const projectsPayload = projectService?.listWithSessions(user.id, "active", 200);
    const reminderCountsByProject = reminderService.countByProject(user.id);
    const projects = (projectsPayload?.projects ?? []).map((project) => ({
      ...project,
      reminderCount: reminderCountsByProject.get(project.id) ?? 0,
    }));
    const threads = threadService?.list(user.id, 100) ?? [];

    return {
      reminders,
      projects,
      hasMoreProjects: projectsPayload?.hasMore ?? false,
      threads,
    };
  });

  app.post("/api/reminders", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const body = (request.body as Record<string, unknown>) ?? {};
    const content = typeof body["content"] === "string" ? body["content"].trim() : "";
    if (!content) {
      return reply.status(400).send({ error: "content is required" });
    }
    const projectId = typeof body["projectId"] === "string" && body["projectId"].trim()
      ? body["projectId"].trim()
      : null;
    if (projectId && projectService && !projectService.getById(projectId, user.id)) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Project not found" });
    }
    const sessionId = typeof body["sessionId"] === "string" && body["sessionId"].trim()
      ? body["sessionId"].trim()
      : null;
    if (sessionId && sessionService && !sessionService.getById(sessionId, user.id)) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Session not found" });
    }

    const reminder = reminderService.create({
      userId: user.id,
      projectId,
      sessionId,
      content,
      sourceType: typeof body["sourceType"] === "string" ? body["sourceType"] : "user",
      sourceId: typeof body["sourceId"] === "string" ? body["sourceId"] : null,
      sourceSurface: typeof body["sourceSurface"] === "string" ? body["sourceSurface"] : "web",
      status: validStatuses.has(body["status"] as ReminderStatus) ? body["status"] as ReminderStatus : "active",
      tags: normalizeTags(body["tags"]) ?? [],
    });

    return reply.status(201).send({ reminder });
  });

  app.patch<{ Params: { id: string } }>("/api/reminders/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const existing = reminderService.getById(request.params.id, user.id);
    if (!existing) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Reminder not found" });
    }
    const body = (request.body as Record<string, unknown>) ?? {};
    const content = typeof body["content"] === "string" ? body["content"].trim() : undefined;
    if (content !== undefined && !content) {
      return reply.status(400).send({ error: "content must not be empty" });
    }
    const status = body["status"] === undefined
      ? undefined
      : validStatuses.has(body["status"] as ReminderStatus)
        ? body["status"] as ReminderStatus
        : null;
    if (status === null) return reply.status(400).send({ error: "invalid status" });

    const reminder = reminderService.update(existing.id, {
      content,
      projectId: body["projectId"] === undefined ? undefined : typeof body["projectId"] === "string" && body["projectId"].trim() ? body["projectId"].trim() : null,
      sessionId: body["sessionId"] === undefined ? undefined : typeof body["sessionId"] === "string" && body["sessionId"].trim() ? body["sessionId"].trim() : null,
      status,
      tags: normalizeTags(body["tags"]),
    }, user.id);
    return { reminder };
  });

  app.delete<{ Params: { id: string } }>("/api/reminders/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const removed = reminderService.delete(request.params.id, user.id);
    if (!removed) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Reminder not found" });
    }
    return { ok: true };
  });
}
