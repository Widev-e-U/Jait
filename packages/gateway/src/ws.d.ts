import type { WsEvent } from "@jait/shared";
import type { UICommandPayload } from "@jait/shared";
import type { ScreenShareSessionState, FsNode, FsBrowseEntry } from "@jait/shared";
import type { AppConfig } from "./config.js";
import type { Server as HttpServer } from "node:http";
export declare class WsControlPlane {
    private config;
    private wss;
    private clients;
    private jwtSecret;
    /** Filesystem nodes registered by clients (keyed by node ID) */
    private fsNodes;
    /** Pending fs browse requests waiting for a response from a remote node */
    private pendingFsBrowse;
    constructor(config: AppConfig);
    /**
     * Attach the WebSocket server to an existing HTTP server (shares port).
     * Falls back to standalone port if no httpServer is provided.
     */
    start(httpServer?: HttpServer): void;
    private extractBearerToken;
    private authenticateClient;
    private handleMessage;
    /** Send an event to a specific client by ID */
    sendToClient(clientId: string, event: WsEvent): void;
    /** Broadcast an event to all clients subscribed to a session */
    broadcast(sessionId: string, event: WsEvent): void;
    /** Broadcast to all connected clients */
    broadcastAll(event: WsEvent): void;
    /** Send a typed UI command to all clients subscribed to the session (server → frontend) */
    sendUICommand(command: UICommandPayload, sessionId?: string): void;
    /**
     * Broadcast to all clients subscribed to a session, excluding one client.
     * Used to relay state changes to other clients without echoing back to the sender.
     */
    broadcastExcluding(sessionId: string, excludeClientId: string, event: WsEvent): void;
    /** Send terminal output data to all clients subscribed to this terminal */
    broadcastTerminalOutput(terminalId: string, data: string): void;
    /** Callback for terminal input from WS clients */
    onTerminalInput?: (terminalId: string, data: string) => void;
    /** Callback for terminal resize from WS clients */
    onTerminalResize?: (terminalId: string, cols: number, rows: number) => void;
    /** Callback to replay buffered output when a client subscribes to a terminal */
    onTerminalReplay?: (terminalId: string) => string | null;
    /** Callback for consent approval from WS clients */
    onConsentApprove?: (requestId: string) => void;
    /** Callback for consent rejection from WS clients */
    onConsentReject?: (requestId: string, reason?: string) => void;
    /** Callback when a client updates UI component state (panel open/close) */
    onUIStateUpdate?: (sessionId: string, key: string, value: unknown | null, clientId: string) => void;
    /** Callback when a client subscribes to a session — used to push full state */
    onClientSubscribe?: (sessionId: string, clientId: string) => void;
    /** Callback when a screen-share start is requested via WS */
    onScreenShareStart?: (hostDeviceId: string, viewerDeviceIds?: string[]) => void;
    /** Callback when a screen-share stop is requested via WS */
    onScreenShareStop?: (sessionId: string) => void;
    /** Relay a signaling message to a specific device ID */
    private relayToDevice;
    /** Broadcast a screen-share state update to all connected clients */
    broadcastScreenShareState(state: ScreenShareSessionState): void;
    /**
     * Programmatically send a screen-share start-request to all connected clients.
     * Used by tools/routes when the session is created server-side and the host
     * device needs to be told to begin capture.
     */
    sendScreenShareStartRequest(sessionId: string, hostDeviceId: string, viewerDeviceIds?: string[]): void;
    /** Find all connected device IDs */
    getConnectedDeviceIds(): string[];
    /** List all registered filesystem nodes */
    getFsNodes(): FsNode[];
    /** Register the gateway itself as a filesystem node */
    registerGatewayFsNode(node: FsNode): void;
    /**
     * Proxy a browse request to a remote filesystem node.
     * Sends a WS message to the owning client and waits for a response.
     */
    proxyFsBrowse(nodeId: string, path: string): Promise<{
        path: string;
        parent: string | null;
        entries: FsBrowseEntry[];
    }>;
    /**
     * Proxy a roots request to a remote filesystem node.
     */
    proxyFsRoots(nodeId: string): Promise<FsBrowseEntry[]>;
    get clientCount(): number;
    private send;
    stop(): void;
}
//# sourceMappingURL=ws.d.ts.map