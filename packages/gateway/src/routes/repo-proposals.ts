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

  app.post<{ Params: { repoId: string } }>("/api/repos/:repoId/proposals", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const repo = getOwnedRepo(request.params.repoId, user.id);
    if (!assertOwnership(reply, repo, user.id, "Repository not found")) return;

    const body = request.body as {
      message?: string;
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
      sourceThreadId: body.sourceThreadId,
      sourceThreadTitle: body.sourceThreadTitle,
    });
    return reply.status(201).send({ proposal });
  });

  app.patch<{ Params: { id: string } }>("/api/repo-proposals/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const existing = getOwnedProposal(request.params.id, user.id);
    if (!assertOwnership(reply, existing, user.id, "Proposal not found")) return;

    const body = request.body as { message?: string };
    const message = body.message?.trim();
    if (message !== undefined && !message) {
      return reply.status(400).send({ error: "message must not be empty" });
    }

    const proposal = repoProposalService.update(existing.id, {
      message,
    });
    return { proposal };
  });

  app.delete<{ Params: { id: string } }>("/api/repo-proposals/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const existing = getOwnedProposal(request.params.id, user.id);
    if (!assertOwnership(reply, existing, user.id, "Proposal not found")) return;
    repoProposalService.delete(existing.id);
    return { ok: true };
  });
}
