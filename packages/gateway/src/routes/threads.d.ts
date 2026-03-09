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
 *   POST   /api/threads/:id/create-pr — create a PR for a completed thread
 *   GET    /api/threads/:id/activities — get activity log
 *   GET    /api/providers            — list available providers
 */
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { ThreadService } from "../services/threads.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { WsControlPlane } from "../ws.js";
import { type GitStackedAction, type GitStepResult } from "../services/git.js";
import type { UserService } from "../services/users.js";
export interface ThreadRouteDeps {
    threadService: ThreadService;
    providerRegistry: ProviderRegistry;
    userService?: UserService;
    ws?: WsControlPlane;
    gitService?: {
        runStackedAction(cwd: string, action: GitStackedAction, commitMessage?: string, featureBranch?: boolean, baseBranch?: string, githubToken?: string): Promise<GitStepResult>;
    };
}
export declare function registerThreadRoutes(app: FastifyInstance, config: AppConfig, deps: ThreadRouteDeps): void;
//# sourceMappingURL=threads.d.ts.map