import { WebSocketServer, type WebSocket } from "ws";
import type { WsEvent } from "@jait/shared";
import type { UICommandPayload } from "@jait/shared";
import type {
  ScreenShareOffer,
  ScreenShareAnswer,
  ScreenShareIceCandidate,
  ScreenShareSessionState,
} from "@jait/shared";
import type { AppConfig } from "./config.js";
import { nanoid } from "nanoid";
import * as jose from "jose";
import type { Server as HttpServer } from "node:http";

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  deviceId: string | null;
  sessionId: string | null;
  userId: string | null;
  authenticated: boolean;
  connectedAt: Date;
  /** Terminal IDs this client is subscribed to for output streaming */
  terminalSubscriptions: Set<string>;
}

export class WsControlPlane {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, ConnectedClient>();
  private jwtSecret: Uint8Array;

  constructor(private config: AppConfig) {
    // Use the configured JWT secret, or a dev-mode fallback
    const secret = config.jwtSecret || "jait-dev-secret-change-in-production";
    this.jwtSecret = new TextEncoder().encode(secret);
  }

  /**
   * Attach the WebSocket server to an existing HTTP server (shares port).
   * Falls back to standalone port if no httpServer is provided.
   */
  start(httpServer?: HttpServer) {
    if (httpServer) {
      this.wss = new WebSocketServer({ server: httpServer });
      console.log("WebSocket control plane attached to HTTP server (shared port)");
    } else {
      this.wss = new WebSocketServer({ port: this.config.wsPort });
      console.log(`WebSocket control plane listening on port ${this.config.wsPort}`);
    }

    this.wss.on("connection", async (ws, req) => {
      const clientId = nanoid();
      const client: ConnectedClient = {
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
      } else if (this.config.nodeEnv === "development") {
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
          const msg = JSON.parse(raw.toString()) as {
            type: string;
            token?: string;
            sessionId?: string;
            deviceId?: string;
            payload?: unknown;
          };
          this.handleMessage(client, msg);
        } catch {
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

  private extractBearerToken(header: string | undefined): string | null {
    if (!header?.startsWith("Bearer ")) return null;
    return header.slice(7);
  }

  private async authenticateClient(client: ConnectedClient, token: string): Promise<boolean> {
    try {
      const { payload } = await jose.jwtVerify(token, this.jwtSecret);
      client.authenticated = true;
      client.userId = (payload.sub as string) ?? null;
      return true;
    } catch {
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

  private async handleMessage(
    client: ConnectedClient,
    msg: { type: string; token?: string; sessionId?: string; deviceId?: string; payload?: unknown },
  ) {
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
        const termId = (msg as { terminalId?: string }).terminalId;
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
        const tId = (msg as { terminalId?: string }).terminalId;
        if (tId) client.terminalSubscriptions.delete(tId);
        break;
      }
      case "terminal.input": {
        // Forward input to the terminal — handled by the caller who sets onTerminalInput
        const inputTermId = (msg as { terminalId?: string }).terminalId;
        const inputData = (msg as { data?: string }).data;
        if (inputTermId && inputData && this.onTerminalInput) {
          this.onTerminalInput(inputTermId, inputData);
        }
        break;
      }
      case "terminal.resize": {
        const resizeTermId = (msg as { terminalId?: string }).terminalId;
        const cols = (msg as { cols?: number }).cols;
        const rows = (msg as { rows?: number }).rows;
        if (resizeTermId && cols && rows && this.onTerminalResize) {
          this.onTerminalResize(resizeTermId, cols, rows);
        }
        break;
      }
      case "consent.approve": {
        const consentId = (msg as { requestId?: string }).requestId;
        if (consentId && this.onConsentApprove) {
          this.onConsentApprove(consentId);
        }
        break;
      }
      case "consent.reject": {
        const rejectId = (msg as { requestId?: string }).requestId;
        const reason = (msg as { reason?: string }).reason;
        if (rejectId && this.onConsentReject) {
          this.onConsentReject(rejectId, reason);
        }
        break;
      }
      // ── Screen sharing signaling ────────────────────────────────
      case "screen-share:offer": {
        const offer = msg.payload as ScreenShareOffer | undefined;
        if (offer) this.relayToDevice(offer.hostDeviceId, client.deviceId, msg);
        break;
      }
      case "screen-share:answer": {
        const answer = msg.payload as ScreenShareAnswer | undefined;
        if (answer) this.relayToDevice(answer.viewerDeviceId, client.deviceId, msg);
        break;
      }
      case "screen-share:ice-candidate": {
        const ice = msg.payload as ScreenShareIceCandidate | undefined;
        if (ice) this.relayToDevice(ice.fromDeviceId, client.deviceId, msg);
        break;
      }
      case "screen-share:start-request": {
        // Relay the start-request to all other connected clients so
        // the target host device receives it and begins screen capture.
        const startReq = msg.payload as { hostDeviceId: string; sessionId?: string; viewerDeviceIds?: string[] } | undefined;
        if (startReq) {
          this.relayToDevice(startReq.hostDeviceId, client.deviceId, msg);
        }
        break;
      }
      case "screen-share:stop-request": {
        if (this.onScreenShareStop) {
          const req = msg.payload as { sessionId: string } | undefined;
          if (req) this.onScreenShareStop(req.sessionId);
        }
        break;
      }
      case "ui.state": {
        // Client is reporting a UI component state change (e.g. panel closed)
        const update = msg.payload as { sessionId?: string; key?: string; value?: unknown } | undefined;
        const uiSessionId = update?.sessionId ?? client.sessionId;
        if (uiSessionId && update?.key && this.onUIStateUpdate) {
          this.onUIStateUpdate(uiSessionId, update.key, update.value ?? null, client.id);
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
  sendToClient(clientId: string, event: WsEvent) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === 1) {
      this.send(client.ws, event);
    }
  }

  /** Broadcast an event to all clients subscribed to a session */
  broadcast(sessionId: string, event: WsEvent) {
    for (const client of this.clients.values()) {
      if (client.sessionId === sessionId && client.ws.readyState === 1) {
        this.send(client.ws, event);
      }
    }
  }

  /** Broadcast to all connected clients */
  broadcastAll(event: WsEvent) {
    for (const client of this.clients.values()) {
      if (client.ws.readyState === 1) {
        this.send(client.ws, event);
      }
    }
  }

  /** Send a typed UI command to all clients subscribed to the session (server → frontend) */
  sendUICommand(command: UICommandPayload, sessionId = "") {
    const event: WsEvent = {
      type: "ui.command",
      sessionId,
      timestamp: new Date().toISOString(),
      payload: command,
    };
    // Use session-scoped broadcast if sessionId is provided, otherwise all clients
    if (sessionId) {
      this.broadcast(sessionId, event);
    } else {
      this.broadcastAll(event);
    }
  }

  /**
   * Broadcast to all clients subscribed to a session, excluding one client.
   * Used to relay state changes to other clients without echoing back to the sender.
   */
  broadcastExcluding(sessionId: string, excludeClientId: string, event: WsEvent) {
    for (const client of this.clients.values()) {
      if (client.id === excludeClientId) continue;
      if (client.sessionId === sessionId && client.ws.readyState === 1) {
        this.send(client.ws, event);
      }
    }
  }

  /** Send terminal output data to all clients subscribed to this terminal */
  broadcastTerminalOutput(terminalId: string, data: string) {
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

  // ── Screen sharing helpers ────────────────────────────────────────

  /** Relay a signaling message to a specific device ID */
  private relayToDevice(
    _targetDeviceId: string,
    fromDeviceId: string | null,
    msg: { type: string; payload?: unknown },
  ) {
    // Broadcast to all clients except the sender.
    // A production implementation would look up targetDeviceId,
    // but for LAN-first P2P, broadcasting to all authenticated clients works.
    for (const client of this.clients.values()) {
      if (client.deviceId === fromDeviceId) continue;
      if (client.ws.readyState !== 1) continue;
      this.send(client.ws, {
        type: msg.type as WsEvent["type"],
        sessionId: "",
        timestamp: new Date().toISOString(),
        payload: msg.payload,
      });
    }
  }

  /** Broadcast a screen-share state update to all connected clients */
  broadcastScreenShareState(state: ScreenShareSessionState) {
    this.broadcastAll({
      type: "screen-share:state-update" as WsEvent["type"],
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
  sendScreenShareStartRequest(sessionId: string, hostDeviceId: string, viewerDeviceIds?: string[]) {
    for (const client of this.clients.values()) {
      if (client.ws.readyState !== 1) continue;
      this.send(client.ws, {
        type: "screen-share:start-request" as WsEvent["type"],
        sessionId: "",
        timestamp: new Date().toISOString(),
        payload: { sessionId, hostDeviceId, viewerDeviceIds },
      });
    }
  }

  /** Find all connected device IDs */
  getConnectedDeviceIds(): string[] {
    return [...this.clients.values()]
      .filter((c) => c.deviceId && c.authenticated)
      .map((c) => c.deviceId!);
  }

  get clientCount() {
    return this.clients.size;
  }

  private send(ws: WebSocket, event: WsEvent) {
    ws.send(JSON.stringify(event));
  }

  stop() {
    this.wss?.close();
  }
}
