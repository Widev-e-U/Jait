/**
 * Session REST routes.
 *
 *   POST   /api/sessions              — create
 *   GET    /api/sessions              — list (filter by ?status=active)
 *   GET    /api/sessions/:id          — get by ID
 *   PATCH  /api/sessions/:id          — update name / metadata
 *   DELETE /api/sessions/:id          — soft-delete
 *   POST   /api/sessions/:id/archive  — archive
 */
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { SessionService } from "../services/sessions.js";
import type { SessionStateService } from "../services/session-state.js";
import type { AuditWriter } from "../services/audit.js";
import type { HookBus } from "../scheduler/hooks.js";
export declare function registerSessionRoutes(app: FastifyInstance, config: AppConfig, sessionService: SessionService, audit: AuditWriter, hooks?: HookBus, sessionState?: SessionStateService): void;
//# sourceMappingURL=sessions.d.ts.map