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
export interface RepoRouteDeps {
    repoService: RepositoryService;
    ws?: WsControlPlane;
}
export declare function registerRepoRoutes(app: FastifyInstance, config: AppConfig, deps: RepoRouteDeps): void;
//# sourceMappingURL=repositories.d.ts.map