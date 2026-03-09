/**
 * Filesystem Browse Routes — browse local or remote filesystems.
 *
 * These endpoints let any client explore directories on the gateway machine
 * or on remote filesystem nodes (Electron apps, phones, etc.) via WS proxy.
 * Used by the folder-picker dialog so users can choose a workspace root
 * from any device on the network.
 */
import type { FastifyInstance } from "fastify";
import type { WsControlPlane } from "../ws.js";
import type { FsBrowseEntry } from "@jait/shared";
export type BrowseEntry = FsBrowseEntry;
export declare function registerFilesystemRoutes(app: FastifyInstance, ws?: WsControlPlane): void;
//# sourceMappingURL=filesystem.d.ts.map