import { WebSocketServer, type WebSocket } from "ws";
import type { WsEvent } from "@jait/shared";
import type { AppConfig } from "./config.js";
import { nanoid } from "nanoid";
import * as jose from "jose";

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  deviceId: string | null;
  sessionId: string | null;
  userId: string | null;
  authenticated: boolean;
  connectedAt: Date;
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

  start() {
    this.wss = new WebSocketServer({ port: this.config.wsPort });
    console.log(`WebSocket control plane listening on port ${this.config.wsPort}`);

    this.wss.on("connection", (ws, req) => {
      const clientId = nanoid();
      const client: ConnectedClient = {
        id: clientId,
        ws,
        deviceId: null,
        sessionId: null,
        userId: null,
        authenticated: false,
        connectedAt: new Date(),
      };
      this.clients.set(clientId, client);

      // Try to authenticate from query string token or Authorization header
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const token = url.searchParams.get("token") ?? this.extractBearerToken(req.headers.authorization);

      if (token) {
        this.authenticateClient(client, token);
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
