/**
 * Workspace Routes — REST API for server-side file browsing.
 *
 * Exposes the FileSystemSurface's list/read/stat operations
 * so the web UI can browse a remote workspace without needing
 * the browser's File System Access API.
 */
import type { FastifyInstance } from "fastify";
import type { SurfaceRegistry } from "../surfaces/index.js";
import type { SessionStateService } from "../services/session-state.js";
import type { SessionService } from "../services/sessions.js";
export declare function registerWorkspaceRoutes(app: FastifyInstance, surfaceRegistry: SurfaceRegistry, sessionState?: SessionStateService, sessionService?: SessionService): void;
//# sourceMappingURL=workspace.d.ts.map