/**
 * Git operation REST routes.
 *
 * Exposes server-side git operations so the web frontend can query status,
 * commit, push, and create PRs — mirroring the t3code git flow but via HTTP.
 *
 *   POST   /api/git/status                — get status for a repo path
 *   POST   /api/git/branches              — list branches
 *   POST   /api/git/pull                  — pull (rebase)
 *   POST   /api/git/run-stacked-action    — commit / push / create PR
 *   POST   /api/git/checkout              — checkout a branch
 *   POST   /api/git/init                  — git init
 */

import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import { GitService } from "../services/git.js";

export function registerGitRoutes(app: FastifyInstance, config: AppConfig): void {
  const git = new GitService();

  /** Git status for a given cwd */
  app.post("/api/git/status", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { cwd } = request.body as { cwd: string };
    if (!cwd) return reply.status(400).send({ error: "Missing cwd" });
    try {
      const status = await git.status(cwd);
      return status;
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Git status failed" });
    }
  });

  /** List branches */
  app.post("/api/git/branches", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { cwd } = request.body as { cwd: string };
    if (!cwd) return reply.status(400).send({ error: "Missing cwd" });
    try {
      const result = await git.listBranches(cwd);
      return result;
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Failed to list branches" });
    }
  });

  /** Pull with rebase */
  app.post("/api/git/pull", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { cwd } = request.body as { cwd: string };
    if (!cwd) return reply.status(400).send({ error: "Missing cwd" });
    try {
      const result = await git.pull(cwd);
      return result;
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Pull failed" });
    }
  });

  /** Run a stacked action: commit, commit_push, or commit_push_pr */
  app.post("/api/git/run-stacked-action", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as Record<string, unknown>;
    const cwd = typeof body["cwd"] === "string" ? body["cwd"] : "";
    const action = typeof body["action"] === "string" ? body["action"] : "";
    const commitMessage = typeof body["commitMessage"] === "string" ? body["commitMessage"] : undefined;
    const featureBranch = body["featureBranch"] === true;

    if (!cwd) return reply.status(400).send({ error: "Missing cwd" });
    if (!["commit", "commit_push", "commit_push_pr"].includes(action)) {
      return reply.status(400).send({ error: `Invalid action: ${action}` });
    }

    try {
      const result = await git.runStackedAction(
        cwd,
        action as "commit" | "commit_push" | "commit_push_pr",
        commitMessage,
        featureBranch,
      );
      return result;
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Action failed" });
    }
  });

  /** Checkout a branch */
  app.post("/api/git/checkout", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as { cwd?: string; branch?: string };
    if (!body.cwd || !body.branch) {
      return reply.status(400).send({ error: "Missing cwd or branch" });
    }
    try {
      await git.checkout(body.cwd, body.branch);
      return { ok: true };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Checkout failed" });
    }
  });

  /** Create a new branch */
  app.post("/api/git/create-branch", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as { cwd?: string; branch?: string; baseBranch?: string };
    if (!body.cwd || !body.branch) {
      return reply.status(400).send({ error: "Missing cwd or branch" });
    }
    try {
      // If baseBranch specified, checkout that first
      if (body.baseBranch) {
        await git.checkout(body.cwd, body.baseBranch);
      }
      await git.createBranch(body.cwd, body.branch);
      return { ok: true, branch: body.branch };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Branch creation failed" });
    }
  });

  /** Diff of uncommitted changes */
  app.post("/api/git/diff", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { cwd } = request.body as { cwd: string };
    if (!cwd) return reply.status(400).send({ error: "Missing cwd" });
    try {
      const result = await git.diff(cwd);
      return result;
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Diff failed" });
    }
  });

  /** Git init */
  app.post("/api/git/init", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { cwd } = request.body as { cwd: string };
    if (!cwd) return reply.status(400).send({ error: "Missing cwd" });
    try {
      await git.init(cwd);
      return { ok: true };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Git init failed" });
    }
  });

  app.log.info("Git routes registered at /api/git/*");
}
