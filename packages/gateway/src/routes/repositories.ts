/**
 * Automation Repository REST routes.
 *
 *   GET    /api/repos       — list repositories for the authenticated user
 *   POST   /api/repos       — create a repository
 *   PATCH  /api/repos/:id   — update a repository
 *   DELETE /api/repos/:id   — delete a repository
 */

import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { RepositoryService } from "../services/repositories.js";
import type { WsControlPlane } from "../ws.js";
import { requireAuth } from "../security/http-auth.js";
import type { WsEventType } from "@jait/shared";

export interface RepoRouteDeps {
  repoService: RepositoryService;
  ws?: WsControlPlane;
}

export function registerRepoRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: RepoRouteDeps,
): void {
  const { repoService, ws } = deps;

  /** Broadcast a repo event over WS to all clients */
  function broadcastRepoEvent(event: string, data: unknown): void {
    if (!ws) return;
    ws.broadcastAll({
      type: `repo.${event}` as WsEventType,
      sessionId: "",
      timestamp: new Date().toISOString(),
      payload: data as Record<string, unknown>,
    });
  }

  // ── LIST ─────────────────────────────────────────────────────────

  app.get("/api/repos", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const repos = repoService.list(user.id);
    return { repos };
  });

  // ── CREATE ───────────────────────────────────────────────────────

  app.post("/api/repos", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const body = request.body as {
      name: string;
      defaultBranch?: string;
      localPath: string;
      deviceId?: string;
    };

    if (!body.name || !body.localPath) {
      return reply.status(400).send({ error: "name and localPath are required" });
    }

    // Prevent duplicate path for same user
    const existing = repoService.findByPath(body.localPath, user.id);
    if (existing) {
      // If re-registered from a different device, update deviceId
      if (body.deviceId && existing.deviceId !== body.deviceId) {
        const updated = repoService.update(existing.id, { deviceId: body.deviceId });
        if (updated) {
          broadcastRepoEvent("updated", { repo: updated });
          return { repo: updated };
        }
      }
      return { repo: existing };
    }

    const repo = repoService.create({
      userId: user.id,
      deviceId: body.deviceId,
      name: body.name,
      defaultBranch: body.defaultBranch,
      localPath: body.localPath,
    });

    broadcastRepoEvent("created", { repo });
    return { repo };
  });

  // ── UPDATE ───────────────────────────────────────────────────────

  app.patch<{ Params: { id: string } }>("/api/repos/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const body = request.body as {
      name?: string;
      defaultBranch?: string;
      localPath?: string;
    };

    const repo = repoService.update(request.params.id, body);
    if (!repo) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    broadcastRepoEvent("updated", { repo });
    return { repo };
  });

  // ── DELETE ───────────────────────────────────────────────────────

  app.delete<{ Params: { id: string } }>("/api/repos/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const existing = repoService.getById(request.params.id);
    if (!existing) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    repoService.delete(request.params.id);
    broadcastRepoEvent("deleted", { repoId: request.params.id });
    return { ok: true };
  });
}
