import { WebSocketServer } from "ws";
import { nanoid } from "nanoid";
import * as jose from "jose";
export class WsControlPlane {
    config;
    wss = null;
    clients = new Map();
    jwtSecret;
    /** Filesystem nodes registered by clients (keyed by node ID) */
    fsNodes = new Map();
    /** Pending fs browse requests waiting for a response from a remote node */
    pendingFsBrowse = new Map();
    constructor(config) {
        this.config = config;
        // Use the configured JWT secret, or a dev-mode fallback
        const secret = config.jwtSecret || "jait-dev-secret-change-in-production";
        this.jwtSecret = new TextEncoder().encode(secret);
    }
    /**
     * Attach the WebSocket server to an existing HTTP server (shares port).
     * Falls back to standalone port if no httpServer is provided.
     */
    start(httpServer) {
        if (httpServer) {
            this.wss = new WebSocketServer({ server: httpServer });
            console.log("WebSocket control plane attached to HTTP server (shared port)");
        }
        else {
            this.wss = new WebSocketServer({ port: this.config.wsPort });
            console.log(`WebSocket control plane listening on port ${this.config.wsPort}`);
        }
        this.wss.on("connection", async (ws, req) => {
            const clientId = nanoid();
            const client = {
                id: clientId,
                ws,
                deviceId: null,
                sessionId: null,
                userId: null,
                authenticated: false,
                connectedAt: new Date(),
                terminalSubscriptions: new Set(),
            };
            this.clients.set(clientId, client);
            // Try to authenticate from query string token or Authorization header
            const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
            const token = url.searchParams.get("token") ?? this.extractBearerToken(req.headers.authorization);
            if (token) {
                await this.authenticateClient(client, token);
            }
            else if (this.config.nodeEnv === "development") {
                // In development mode, allow unauthenticated connections
                client.authenticated = true;
                client.userId = "dev-user";
            }
            this.send(ws, {
                type: "session.created",
                sessionId: "",
                timestamp: new Date().toISOString(),
                payload: { clientId, authenticated: client.authenticated },
            });
            ws.on("message", (raw) => {
                try {
                    const msg = JSON.parse(raw.toString());
                    this.handleMessage(client, msg);
                }
                catch {
                    this.send(ws, {
                        type: "error",
                        sessionId: client.sessionId ?? "",
                        timestamp: new Date().toISOString(),
                        payload: { message: "Invalid JSON" },
                    });
                }
            });
            ws.on("close", () => {
                this.clients.delete(clientId);
            });
            ws.on("error", () => {
                this.clients.delete(clientId);
            });
        });
    }
    extractBearerToken(header) {
        if (!header?.startsWith("Bearer "))
            return null;
        return header.slice(7);
    }
    async authenticateClient(client, token) {
        try {
            const { payload } = await jose.jwtVerify(token, this.jwtSecret);
            client.authenticated = true;
            client.userId = payload.sub ?? null;
            return true;
        }
        catch {
            // In dev mode, still allow connection but mark as unauthenticated
            if (this.config.nodeEnv === "development") {
                client.authenticated = true;
                client.userId = "dev-user";
                return true;
            }
            this.send(client.ws, {
                type: "error",
                sessionId: "",
                timestamp: new Date().toISOString(),
                payload: { message: "Authentication failed", code: "UNAUTHORIZED" },
            });
            client.ws.close(4001, "Unauthorized");
            return false;
        }
    }
    async handleMessage(client, msg) {
        switch (msg.type) {
            case "authenticate": {
                // Allow late authentication via message
                if (msg.token) {
                    const ok = await this.authenticateClient(client, msg.token);
                    if (ok) {
                        this.send(client.ws, {
                            type: "session.created",
                            sessionId: client.sessionId ?? "",
                            timestamp: new Date().toISOString(),
                            payload: { authenticated: true, userId: client.userId },
                        });
                    }
                }
                break;
            }
            case "subscribe": {
                if (!client.authenticated) {
                    this.send(client.ws, {
                        type: "error",
                        sessionId: "",
                        timestamp: new Date().toISOString(),
                        payload: { message: "Must authenticate before subscribing", code: "UNAUTHORIZED" },
                    });
                    return;
                }
                client.sessionId = msg.sessionId ?? null;
                client.deviceId = msg.deviceId ?? null;
                this.send(client.ws, {
                    type: "session.created",
                    sessionId: client.sessionId ?? "",
                    timestamp: new Date().toISOString(),
                    payload: { subscribed: true },
                });
                // Push full session state to the newly-subscribed client
                if (client.sessionId && this.onClientSubscribe) {
                    this.onClientSubscribe(client.sessionId, client.id);
                }
                break;
            }
            case "terminal.subscribe": {
                if (!client.authenticated) {
                    this.send(client.ws, {
                        type: "error",
                        sessionId: "",
                        timestamp: new Date().toISOString(),
                        payload: { message: "Must authenticate before subscribing", code: "UNAUTHORIZED" },
                    });
                    return;
                }
                const termId = msg.terminalId;
                if (termId) {
                    client.terminalSubscriptions.add(termId);
                    this.send(client.ws, {
                        type: "surface.connected",
                        sessionId: client.sessionId ?? "",
                        timestamp: new Date().toISOString(),
                        payload: { terminalId: termId, subscribed: true },
                    });
                    // Replay buffered output so the client sees the shell banner/prompt
                    if (this.onTerminalReplay) {
                        const buffered = this.onTerminalReplay(termId);
                        if (buffered) {
                            this.send(client.ws, {
                                type: "surface.connected",
                                sessionId: client.sessionId ?? "",
                                timestamp: new Date().toISOString(),
                                payload: { type: "terminal.output", terminalId: termId, data: buffered },
                            });
                        }
                    }
                }
                break;
            }
            case "terminal.unsubscribe": {
                const tId = msg.terminalId;
                if (tId)
                    client.terminalSubscriptions.delete(tId);
                break;
            }
            case "terminal.input": {
                // Forward input to the terminal — handled by the caller who sets onTerminalInput
                const inputTermId = msg.terminalId;
                const inputData = msg.data;
                if (inputTermId && inputData && this.onTerminalInput) {
                    this.onTerminalInput(inputTermId, inputData);
                }
                break;
            }
            case "terminal.resize": {
                const resizeTermId = msg.terminalId;
                const cols = msg.cols;
                const rows = msg.rows;
                if (resizeTermId && cols && rows && this.onTerminalResize) {
                    this.onTerminalResize(resizeTermId, cols, rows);
                }
                break;
            }
            case "consent.approve": {
                const consentId = msg.requestId;
                if (consentId && this.onConsentApprove) {
                    this.onConsentApprove(consentId);
                }
                break;
            }
            case "consent.reject": {
                const rejectId = msg.requestId;
                const reason = msg.reason;
                if (rejectId && this.onConsentReject) {
                    this.onConsentReject(rejectId, reason);
                }
                break;
            }
            // ── Screen sharing signaling ────────────────────────────────
            case "screen-share:offer": {
                const offer = msg.payload;
                if (offer)
                    this.relayToDevice(offer.hostDeviceId, client.deviceId, msg);
                break;
            }
            case "screen-share:answer": {
                const answer = msg.payload;
                if (answer)
                    this.relayToDevice(answer.viewerDeviceId, client.deviceId, msg);
                break;
            }
            case "screen-share:ice-candidate": {
                const ice = msg.payload;
                if (ice)
                    this.relayToDevice(ice.fromDeviceId, client.deviceId, msg);
                break;
            }
            case "screen-share:start-request": {
                // Relay the start-request to all other connected clients so
                // the target host device receives it and begins screen capture.
                const startReq = msg.payload;
                if (startReq) {
                    this.relayToDevice(startReq.hostDeviceId, client.deviceId, msg);
                }
                break;
            }
            case "screen-share:stop-request": {
                if (this.onScreenShareStop) {
                    const req = msg.payload;
                    if (req)
                        this.onScreenShareStop(req.sessionId);
                }
                break;
            }
            case "ui.state": {
                // Client is reporting a UI component state change (e.g. panel closed)
                const update = msg.payload;
                const uiSessionId = update?.sessionId ?? client.sessionId;
                if (uiSessionId && update?.key && this.onUIStateUpdate) {
                    this.onUIStateUpdate(uiSessionId, update.key, update.value ?? null, client.id);
                }
                break;
            }
            // ── Filesystem node protocol ────────────────────────────────
            case "fs.register-node": {
                const p = msg.payload;
                if (p?.id && p.name && p.platform) {
                    const node = {
                        id: p.id,
                        name: p.name,
                        platform: p.platform,
                        clientId: client.id,
                        isGateway: false,
                        registeredAt: new Date().toISOString(),
                    };
                    this.fsNodes.set(node.id, node);
                    console.log(`[ws] fs node registered: ${node.name} (${node.id}) on client ${client.id}`);
                }
                break;
            }
            case "fs.browse-response": {
                // A client responded to a fs browse request we proxied to it
                const resp = msg.payload;
                if (resp?.requestId) {
                    const pending = this.pendingFsBrowse.get(resp.requestId);
                    if (pending) {
                        this.pendingFsBrowse.delete(resp.requestId);
                        clearTimeout(pending.timer);
                        if (resp.error) {
                            pending.reject(new Error(resp.error));
                        }
                        else {
                            pending.resolve({
                                path: resp.path ?? "",
                                parent: resp.parent ?? null,
                                entries: resp.entries ?? [],
                            });
                        }
                    }
                }
                break;
            }
            case "fs.roots-response": {
                const resp = msg.payload;
                if (resp?.requestId) {
                    const pending = this.pendingFsBrowse.get(resp.requestId);
                    if (pending) {
                        this.pendingFsBrowse.delete(resp.requestId);
                        clearTimeout(pending.timer);
                        if (resp.error) {
                            pending.reject(new Error(resp.error));
                        }
                        else {
                            pending.resolve({
                                path: "",
                                parent: null,
                                entries: resp.roots ?? [],
                            });
                        }
                    }
                }
                break;
            }
            default: {
                this.send(client.ws, {
                    type: "error",
                    sessionId: client.sessionId ?? "",
                    timestamp: new Date().toISOString(),
                    payload: { message: `Unknown message type: ${msg.type}` },
                });
            }
        }
    }
    /** Send an event to a specific client by ID */
    sendToClient(clientId, event) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === 1) {
            this.send(client.ws, event);
        }
    }
    /** Broadcast an event to all clients subscribed to a session */
    broadcast(sessionId, event) {
        for (const client of this.clients.values()) {
            if (client.sessionId === sessionId && client.ws.readyState === 1) {
                this.send(client.ws, event);
            }
        }
    }
    /** Broadcast to all connected clients */
    broadcastAll(event) {
        for (const client of this.clients.values()) {
            if (client.ws.readyState === 1) {
                this.send(client.ws, event);
            }
        }
    }
    /** Send a typed UI command to all clients subscribed to the session (server → frontend) */
    sendUICommand(command, sessionId = "") {
        const event = {
            type: "ui.command",
            sessionId,
            timestamp: new Date().toISOString(),
            payload: command,
        };
        // Use session-scoped broadcast if sessionId is provided, otherwise all clients
        if (sessionId) {
            this.broadcast(sessionId, event);
        }
        else {
            this.broadcastAll(event);
        }
    }
    /**
     * Broadcast to all clients subscribed to a session, excluding one client.
     * Used to relay state changes to other clients without echoing back to the sender.
     */
    broadcastExcluding(sessionId, excludeClientId, event) {
        for (const client of this.clients.values()) {
            if (client.id === excludeClientId)
                continue;
            if (client.sessionId === sessionId && client.ws.readyState === 1) {
                this.send(client.ws, event);
            }
        }
    }
    /** Send terminal output data to all clients subscribed to this terminal */
    broadcastTerminalOutput(terminalId, data) {
        for (const client of this.clients.values()) {
            if (client.terminalSubscriptions.has(terminalId) && client.ws.readyState === 1) {
                this.send(client.ws, {
                    type: "surface.connected", // reuse event type
                    sessionId: client.sessionId ?? "",
                    timestamp: new Date().toISOString(),
                    payload: { type: "terminal.output", terminalId, data },
                });
            }
        }
    }
    /** Callback for terminal input from WS clients */
    onTerminalInput;
    /** Callback for terminal resize from WS clients */
    onTerminalResize;
    /** Callback to replay buffered output when a client subscribes to a terminal */
    onTerminalReplay;
    /** Callback for consent approval from WS clients */
    onConsentApprove;
    /** Callback for consent rejection from WS clients */
    onConsentReject;
    /** Callback when a client updates UI component state (panel open/close) */
    onUIStateUpdate;
    /** Callback when a client subscribes to a session — used to push full state */
    onClientSubscribe;
    /** Callback when a screen-share start is requested via WS */
    onScreenShareStart;
    /** Callback when a screen-share stop is requested via WS */
    onScreenShareStop;
    // ── Screen sharing helpers ────────────────────────────────────────
    /** Relay a signaling message to a specific device ID */
    relayToDevice(_targetDeviceId, fromDeviceId, msg) {
        // Broadcast to all clients except the sender.
        // A production implementation would look up targetDeviceId,
        // but for LAN-first P2P, broadcasting to all authenticated clients works.
        for (const client of this.clients.values()) {
            if (client.deviceId === fromDeviceId)
                continue;
            if (client.ws.readyState !== 1)
                continue;
            this.send(client.ws, {
                type: msg.type,
                sessionId: "",
                timestamp: new Date().toISOString(),
                payload: msg.payload,
            });
        }
    }
    /** Broadcast a screen-share state update to all connected clients */
    broadcastScreenShareState(state) {
        this.broadcastAll({
            type: "screen-share:state-update",
            sessionId: "",
            timestamp: new Date().toISOString(),
            payload: state,
        });
    }
    /**
     * Programmatically send a screen-share start-request to all connected clients.
     * Used by tools/routes when the session is created server-side and the host
     * device needs to be told to begin capture.
     */
    sendScreenShareStartRequest(sessionId, hostDeviceId, viewerDeviceIds) {
        for (const client of this.clients.values()) {
            if (client.ws.readyState !== 1)
                continue;
            this.send(client.ws, {
                type: "screen-share:start-request",
                sessionId: "",
                timestamp: new Date().toISOString(),
                payload: { sessionId, hostDeviceId, viewerDeviceIds },
            });
        }
    }
    /** Find all connected device IDs */
    getConnectedDeviceIds() {
        return [...this.clients.values()]
            .filter((c) => c.deviceId && c.authenticated)
            .map((c) => c.deviceId);
    }
    // ── Filesystem node helpers ─────────────────────────────────────
    /** List all registered filesystem nodes */
    getFsNodes() {
        // Clean up nodes whose client has disconnected
        for (const [id, node] of this.fsNodes) {
            if (!node.isGateway && !this.clients.has(node.clientId)) {
                this.fsNodes.delete(id);
            }
        }
        return [...this.fsNodes.values()];
    }
    /** Register the gateway itself as a filesystem node */
    registerGatewayFsNode(node) {
        this.fsNodes.set(node.id, node);
    }
    /**
     * Proxy a browse request to a remote filesystem node.
     * Sends a WS message to the owning client and waits for a response.
     */
    proxyFsBrowse(nodeId, path) {
        const node = this.fsNodes.get(nodeId);
        if (!node)
            return Promise.reject(new Error(`Unknown filesystem node: ${nodeId}`));
        if (node.isGateway)
            return Promise.reject(new Error("Use local browse for gateway node"));
        const client = this.clients.get(node.clientId);
        if (!client || client.ws.readyState !== 1) {
            return Promise.reject(new Error(`Node ${nodeId} is not connected`));
        }
        const requestId = nanoid();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingFsBrowse.delete(requestId);
                reject(new Error("Browse request timed out"));
            }, 10000);
            this.pendingFsBrowse.set(requestId, { resolve, reject, timer });
            this.send(client.ws, {
                type: "fs.browse-request",
                sessionId: "",
                timestamp: new Date().toISOString(),
                payload: { requestId, path },
            });
        });
    }
    /**
     * Proxy a roots request to a remote filesystem node.
     */
    proxyFsRoots(nodeId) {
        const node = this.fsNodes.get(nodeId);
        if (!node)
            return Promise.reject(new Error(`Unknown filesystem node: ${nodeId}`));
        if (node.isGateway)
            return Promise.reject(new Error("Use local roots for gateway node"));
        const client = this.clients.get(node.clientId);
        if (!client || client.ws.readyState !== 1) {
            return Promise.reject(new Error(`Node ${nodeId} is not connected`));
        }
        const requestId = nanoid();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingFsBrowse.delete(requestId);
                reject(new Error("Roots request timed out"));
            }, 10000);
            this.pendingFsBrowse.set(requestId, {
                resolve: (resp) => resolve(resp.entries),
                reject,
                timer,
            });
            this.send(client.ws, {
                type: "fs.roots-request",
                sessionId: "",
                timestamp: new Date().toISOString(),
                payload: { requestId },
            });
        });
    }
    get clientCount() {
        return this.clients.size;
    }
    send(ws, event) {
        ws.send(JSON.stringify(event));
    }
    stop() {
        this.wss?.close();
    }
}
//# sourceMappingURL=ws.js.map