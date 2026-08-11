import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  PullRequestConflictSide,
  PullRequestDetail,
  PullRequestDiff,
  PullRequestListState,
  PullRequestMergeMethod,
  PullRequestResolveResult,
  PullRequestReviewEvent,
  PullRequestSummary,
} from "@jait/shared";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import type { RepositoryService, RepoRow } from "../services/repositories.js";

export interface PullRequestOperations {
  list(remoteUrl: string | null, state: PullRequestListState, limit: number): Promise<PullRequestSummary[]>;
  get(remoteUrl: string | null, number: number): Promise<PullRequestDetail>;
  diff(remoteUrl: string | null, number: number): Promise<PullRequestDiff>;
  comment(remoteUrl: string | null, number: number, body: string): Promise<void>;
  review(
    remoteUrl: string | null,
    number: number,
    event: PullRequestReviewEvent,
    body: string,
  ): Promise<void>;
  merge(
    remoteUrl: string | null,
    number: number,
    method: PullRequestMergeMethod,
    deleteBranch: boolean,
  ): Promise<void>;
  resolveConflicts(
    remoteUrl: string | null,
    number: number,
    resolution?: Record<string, PullRequestConflictSide>,
  ): Promise<PullRequestResolveResult>;
  setState(remoteUrl: string | null, number: number, state: "open" | "closed"): Promise<void>;
  update(
    remoteUrl: string | null,
    number: number,
    input: { title?: string; body?: string },
  ): Promise<void>;
}

export interface PullRequestRouteDeps {
  repoService: RepositoryService;
  pullRequestService?: PullRequestOperations;
  pullRequestServiceForUser?: (userId: string) => PullRequestOperations;
}

function parseNumber(value: string): number | null {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function sendError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error
    ? error.message
    : "GitHub pull request operation failed.";
  return reply.status(502).send({ error: message });
}

export function registerPullRequestRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: PullRequestRouteDeps,
): void {
  async function ownedRepo(
    request: FastifyRequest,
    reply: FastifyReply,
    repoId: string,
  ): Promise<{ repo: RepoRow; service: PullRequestOperations } | null> {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return null;
    const repo = deps.repoService.getById(repoId);
    if (!repo || repo.userId !== user.id) {
      reply.status(404).send({ error: "Repository not found" });
      return null;
    }
    const service = deps.pullRequestService ?? deps.pullRequestServiceForUser?.(user.id);
    if (!service) {
      reply.status(503).send({ error: "GitHub pull request service is unavailable" });
      return null;
    }
    return { repo, service };
  }

  app.get<{ Params: { id: string }; Querystring: { state?: string; limit?: string } }>(
    "/api/repos/:id/pull-requests",
    async (request, reply) => {
      const owned = await ownedRepo(request, reply, request.params.id);
      if (!owned) return;
      const { repo, service } = owned;
      const requestedState = request.query.state ?? "open";
      const listState: PullRequestListState = ["open", "closed", "merged", "all"].includes(requestedState)
        ? requestedState as PullRequestListState
        : "open";
      const requestedLimit = Number.parseInt(request.query.limit ?? "50", 10);
      const limit = Math.min(
        100,
        Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 50),
      );
      try {
        return { pullRequests: await service.list(repo.githubUrl, listState, limit) };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get<{ Params: { id: string; number: string } }>(
    "/api/repos/:id/pull-requests/:number",
    async (request, reply) => {
      const owned = await ownedRepo(request, reply, request.params.id);
      if (!owned) return;
      const { repo, service } = owned;
      const number = parseNumber(request.params.number);
      if (!number) return reply.status(400).send({ error: "Invalid pull request number" });
      try {
        return { pullRequest: await service.get(repo.githubUrl, number) };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get<{ Params: { id: string; number: string } }>(
    "/api/repos/:id/pull-requests/:number/diff",
    async (request, reply) => {
      const owned = await ownedRepo(request, reply, request.params.id);
      if (!owned) return;
      const { repo, service } = owned;
      const number = parseNumber(request.params.number);
      if (!number) return reply.status(400).send({ error: "Invalid pull request number" });
      try {
        return await service.diff(repo.githubUrl, number);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post<{ Params: { id: string; number: string }; Body: { body?: string } }>(
    "/api/repos/:id/pull-requests/:number/comments",
    async (request, reply) => {
      const owned = await ownedRepo(request, reply, request.params.id);
      if (!owned) return;
      const { repo, service } = owned;
      const number = parseNumber(request.params.number);
      const body = request.body?.body?.trim();
      if (!number) return reply.status(400).send({ error: "Invalid pull request number" });
      if (!body) return reply.status(400).send({ error: "Comment body is required" });
      try {
        await service.comment(repo.githubUrl, number, body);
        return { ok: true };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post<{
    Params: { id: string; number: string };
    Body: { event?: PullRequestReviewEvent; body?: string };
  }>(
    "/api/repos/:id/pull-requests/:number/reviews",
    async (request, reply) => {
      const owned = await ownedRepo(request, reply, request.params.id);
      if (!owned) return;
      const { repo, service } = owned;
      const number = parseNumber(request.params.number);
      const event = request.body?.event;
      if (!number) return reply.status(400).send({ error: "Invalid pull request number" });
      if (!event || !["approve", "comment", "request_changes"].includes(event)) {
        return reply.status(400).send({ error: "Invalid review event" });
      }
      try {
        await service.review(repo.githubUrl, number, event, request.body?.body ?? "");
        return { ok: true };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post<{
    Params: { id: string; number: string };
    Body: { method?: PullRequestMergeMethod; deleteBranch?: boolean };
  }>(
    "/api/repos/:id/pull-requests/:number/merge",
    async (request, reply) => {
      const owned = await ownedRepo(request, reply, request.params.id);
      if (!owned) return;
      const { repo, service } = owned;
      const number = parseNumber(request.params.number);
      const method = request.body?.method ?? "squash";
      if (!number) return reply.status(400).send({ error: "Invalid pull request number" });
      if (!["merge", "squash", "rebase"].includes(method)) {
        return reply.status(400).send({ error: "Invalid merge method" });
      }
      try {
        await service.merge(
          repo.githubUrl,
          number,
          method,
          request.body?.deleteBranch ?? true,
        );
        return { ok: true };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post<{
    Params: { id: string; number: string };
    Body: { resolution?: Record<string, PullRequestConflictSide> };
  }>(
    "/api/repos/:id/pull-requests/:number/resolve-conflicts",
    async (request, reply) => {
      const owned = await ownedRepo(request, reply, request.params.id);
      if (!owned) return;
      const { repo, service } = owned;
      const number = parseNumber(request.params.number);
      if (!number) return reply.status(400).send({ error: "Invalid pull request number" });
      const resolution = request.body?.resolution;
      if (resolution !== undefined) {
        const invalid = Object.entries(resolution).some(
          ([, side]) => side !== "ours" && side !== "theirs",
        );
        if (invalid) {
          return reply.status(400).send({ error: "Invalid conflict resolution side" });
        }
      }
      try {
        return await service.resolveConflicts(repo.githubUrl, number, resolution);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.patch<{
    Params: { id: string; number: string };
    Body: { state?: "open" | "closed"; title?: string; body?: string };
  }>(
    "/api/repos/:id/pull-requests/:number",
    async (request, reply) => {
      const owned = await ownedRepo(request, reply, request.params.id);
      if (!owned) return;
      const { repo, service } = owned;
      const number = parseNumber(request.params.number);
      if (!number) return reply.status(400).send({ error: "Invalid pull request number" });

      const nextState = request.body?.state;
      const hasEdit = request.body?.title !== undefined || request.body?.body !== undefined;
      if (nextState && !["open", "closed"].includes(nextState)) {
        return reply.status(400).send({ error: "Invalid pull request state" });
      }
      if (!nextState && !hasEdit) {
        return reply.status(400).send({ error: "No changes supplied" });
      }

      try {
        if (hasEdit) {
          const title = request.body.title?.trim();
          if (request.body.title !== undefined && !title) {
            return reply.status(400).send({ error: "Pull request title cannot be empty" });
          }
          await service.update(repo.githubUrl, number, {
            title,
            body: request.body.body,
          });
        }
        if (nextState) await service.setState(repo.githubUrl, number, nextState);
        return { ok: true };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
