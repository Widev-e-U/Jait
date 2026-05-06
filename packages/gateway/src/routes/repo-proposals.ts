import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { RepositoryService } from "../services/repositories.js";
import type { RepoProposalService } from "../services/repo-proposals.js";
import { requireAuth } from "../security/http-auth.js";
import { assertOwnership } from "../security/ownership.js";

export interface RepoProposalRouteDeps {
  repoService: RepositoryService;
  repoProposalService: RepoProposalService;
}

export function registerRepoProposalRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: RepoProposalRouteDeps,
): void {
  const { repoService, repoProposalService } = deps;
  const validStatuses = new Set(["open", "in_progress", "done"]);
  const validPriorities = new Set(["low", "normal", "high"]);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  function normalizeTags(value: unknown): string[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) return [];
    return [...new Set(value
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean))]
      .slice(0, 12);
  }

  function normalizeDueDate(value: unknown): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    return typeof value === "string" && datePattern.test(value) ? value : null;
  }

  function getOwnedRepo(repoId: string, userId: string) {
    const repo = repoService.getById(repoId);
    return repo?.userId === userId ? repo : null;
  }

  function getOwnedProposal(id: string, userId: string) {
    const proposal = repoProposalService.getById(id);
    return proposal?.userId === userId ? proposal : null;
  }

  app.get<{ Params: { repoId: string } }>("/api/repos/:repoId/proposals", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const repo = getOwnedRepo(request.params.repoId, user.id);
    if (!assertOwnership(reply, repo, user.id, "Repository not found")) return;
    return { proposals: repoProposalService.listByRepo(repo.id) };
  });

  app.get<{ Params: { repoId: string } }>("/api/repos/:repoId/todos", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const repo = getOwnedRepo(request.params.repoId, user.id);
    if (!assertOwnership(reply, repo, user.id, "Repository not found")) return;
    return { todos: repoProposalService.listByRepo(repo.id) };
  });

  app.post<{ Params: { repoId: string } }>("/api/repos/:repoId/proposals", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const repo = getOwnedRepo(request.params.repoId, user.id);
    if (!assertOwnership(reply, repo, user.id, "Repository not found")) return;

    const body = request.body as {
      message?: string;
      status?: string;
      priority?: string;
      dueDate?: string | null;
      tags?: string[];
      sourceThreadId?: string | null;
      sourceThreadTitle?: string | null;
    };
    const message = body.message?.trim() ?? "";
    if (!message) {
      return reply.status(400).send({ error: "message is required" });
    }

    const proposal = repoProposalService.create({
      repoId: repo.id,
      userId: user.id,
      message,
      status: validStatuses.has(body.status ?? "") ? body.status : undefined,
      priority: validPriorities.has(body.priority ?? "") ? body.priority : undefined,
      dueDate: normalizeDueDate(body.dueDate),
      tags: normalizeTags(body.tags),
      sourceThreadId: body.sourceThreadId,
      sourceThreadTitle: body.sourceThreadTitle,
    });
    return reply.status(201).send({ proposal });
  });

  app.post<{ Params: { repoId: string } }>("/api/repos/:repoId/todos", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const repo = getOwnedRepo(request.params.repoId, user.id);
    if (!assertOwnership(reply, repo, user.id, "Repository not found")) return;

    const body = request.body as {
      message?: string;
      status?: string;
      priority?: string;
      dueDate?: string | null;
      tags?: string[];
      sourceThreadId?: string | null;
      sourceThreadTitle?: string | null;
    };
    const message = body.message?.trim() ?? "";
    if (!message) {
      return reply.status(400).send({ error: "message is required" });
    }

    const todo = repoProposalService.create({
      repoId: repo.id,
      userId: user.id,
      message,
      status: validStatuses.has(body.status ?? "") ? body.status : undefined,
      priority: validPriorities.has(body.priority ?? "") ? body.priority : undefined,
      dueDate: normalizeDueDate(body.dueDate),
      tags: normalizeTags(body.tags),
      sourceThreadId: body.sourceThreadId,
      sourceThreadTitle: body.sourceThreadTitle,
    });
    return reply.status(201).send({ todo });
  });

  app.patch<{ Params: { id: string } }>("/api/repo-proposals/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const existing = getOwnedProposal(request.params.id, user.id);
    if (!assertOwnership(reply, existing, user.id, "Todo not found")) return;

    const body = request.body as { message?: string; status?: string; priority?: string; dueDate?: string | null; tags?: string[] };
    const message = body.message?.trim();
    if (message !== undefined && !message) {
      return reply.status(400).send({ error: "message must not be empty" });
    }
    if (body.status !== undefined && !validStatuses.has(body.status)) {
      return reply.status(400).send({ error: "invalid status" });
    }
    if (body.priority !== undefined && !validPriorities.has(body.priority)) {
      return reply.status(400).send({ error: "invalid priority" });
    }

    const proposal = repoProposalService.update(existing.id, {
      message,
      status: body.status,
      priority: body.priority,
      dueDate: normalizeDueDate(body.dueDate),
      tags: normalizeTags(body.tags),
    });
    return { proposal };
  });

  app.patch<{ Params: { id: string } }>("/api/jait-todos/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const existing = getOwnedProposal(request.params.id, user.id);
    if (!assertOwnership(reply, existing, user.id, "Todo not found")) return;

    const body = request.body as { message?: string; status?: string; priority?: string; dueDate?: string | null; tags?: string[] };
    const message = body.message?.trim();
    if (message !== undefined && !message) {
      return reply.status(400).send({ error: "message must not be empty" });
    }
    if (body.status !== undefined && !validStatuses.has(body.status)) {
      return reply.status(400).send({ error: "invalid status" });
    }
    if (body.priority !== undefined && !validPriorities.has(body.priority)) {
      return reply.status(400).send({ error: "invalid priority" });
    }

    const todo = repoProposalService.update(existing.id, {
      message,
      status: body.status,
      priority: body.priority,
      dueDate: normalizeDueDate(body.dueDate),
      tags: normalizeTags(body.tags),
    });
    return { todo };
  });

  app.delete<{ Params: { id: string } }>("/api/repo-proposals/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const existing = getOwnedProposal(request.params.id, user.id);
    if (!assertOwnership(reply, existing, user.id, "Todo not found")) return;
    repoProposalService.delete(existing.id);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/api/jait-todos/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const existing = getOwnedProposal(request.params.id, user.id);
    if (!assertOwnership(reply, existing, user.id, "Todo not found")) return;
    repoProposalService.delete(existing.id);
    return { ok: true };
  });
}
