/**
 * Screen-share REST routes
 *
 * Provides HTTP endpoints for screen-share session management.
 * WebRTC signaling happens over WebSocket (see ws.ts); these routes
 * are for session lifecycle, device registration, and state queries.
 */
import type { FastifyInstance } from "fastify";
import type { ScreenShareService } from "@jait/screen-share";
import type { WsControlPlane } from "../ws.js";
interface ScreenShareRouteDeps {
    screenShare: ScreenShareService;
    ws: WsControlPlane;
}
export declare function registerScreenShareRoutes(app: FastifyInstance, deps: ScreenShareRouteDeps): void;
export {};
//# sourceMappingURL=screen-share.d.ts.map