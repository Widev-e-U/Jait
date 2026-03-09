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
export declare function registerGitRoutes(app: FastifyInstance, config: AppConfig): void;
//# sourceMappingURL=git.d.ts.map