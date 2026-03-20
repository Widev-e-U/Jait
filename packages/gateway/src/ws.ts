import { WebSocketServer, type WebSocket } from "ws";
import type { WsEvent } from "@jait/shared";
import type { UICommandPayload } from "@jait/shared";
import type {
  ScreenShareOffer,
  ScreenShareAnswer,
  ScreenShareIceCandidate,
  ScreenShareSessionState,
  FsNode,
  FsBrowseEntry,
  NodeHelloPayload,
  NodeRegistrySnapshot,
  NodeState,
} from "@jait/shared";
import type { AppConfig } from "./config.js";
import { nanoid } from "nanoid";
import * as jose from "jose";
import type { Server as HttpServer } from "node:http";
import { NODE_PROTOCOL_VERSION } from "@jait/shared";
import { NodeStateManager } from "./services/node-state-manager.js";
import type { ToolOutputStreamMetadata } from "./tools/contracts.js";

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

  /** Filesystem nodes registered by clients (keyed by node ID) */
  private fsNodes = new Map<string, FsNode>();
  /** Pending fs browse requests waiting for a response from a remote node */
  private pendingFsBrowse = new Map<string, {
    resolve: (value: { path: string; parent: string | null; entries: FsBrowseEntry[] }) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  /** Generic pending fs operations (stat, read, write, list) waiting for remote node response */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pendingFsOps = new Map<string, {
    resolve: (value: any) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  /** Pending remote provider operation requests */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pendingProviderOps = new Map<string, {
    resolve: (value: any) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  /** Pending remote tool execution requests */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pendingToolOps = new Map<string, {
    resolve: (value: any) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
    onOutputChunk?: (chunk: string, metadata?: ToolOutputStreamMetadata) => void;
  }>();
  private nodeStates = new NodeStateManager();
  private terminalStreamState = new Map<string, { nextSeq: number; streamId: string }>();
  private providerStreamState = new Map<string, { nextSeq: number; streamId: string }>();
  private toolStreamState = new Map<string, { nextSeq: number; streamId: string }>();
  getThreadSnapshot?: (userId: string) => { serverTime: string; threads: unknown[] };
  getSurfaceSnapshot?: () => { serverTime: string; surfaces: unknown[] };

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
        this.broadcastDisconnectedNodes(clientId);
        this.clients.delete(clientId);
        this.broadcastFsNodeChange(clientId);
      });

      ws.on("error", () => {
        this.broadcastDisconnectedNodes(clientId);
        this.clients.delete(clientId);
        this.broadcastFsNodeChange(clientId);
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
        console.log(`[screen-share] subscribe: clientId=${client.id} deviceId=${client.deviceId} sessionId=${client.sessionId}`);
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
      case "resource.subscribe": {
        if (!client.authenticated) {
          this.send(client.ws, {
            type: "error",
            sessionId: "",
            timestamp: new Date().toISOString(),
            payload: { message: "Must authenticate before subscribing", code: "UNAUTHORIZED" },
          });
          return;
        }
        const resource = (msg.payload as { resource?: string } | undefined)?.resource;
        if (resource === "root:/nodes") {
          this.sendNodeRegistrySnapshot(client.ws);
          return;
        }
        if (resource === "root:/threads") {
          const userId = client.userId?.trim();
          if (!userId || !this.getThreadSnapshot) {
            this.send(client.ws, {
              type: "error",
              sessionId: client.sessionId ?? "",
              timestamp: new Date().toISOString(),
              payload: { message: "Thread registry unavailable" },
            });
            return;
          }
          this.send(client.ws, {
            type: "thread.updated",
            sessionId: "",
            timestamp: new Date().toISOString(),
            payload: this.getThreadSnapshot(userId),
          });
          return;
        }
        if (resource === "root:/surfaces") {
          if (!this.getSurfaceSnapshot) {
            this.send(client.ws, {
              type: "error",
              sessionId: client.sessionId ?? "",
              timestamp: new Date().toISOString(),
              payload: { message: "Surface registry unavailable" },
            });
            return;
          }
          this.send(client.ws, {
            type: "surface.registry",
            sessionId: "",
            timestamp: new Date().toISOString(),
            payload: this.getSurfaceSnapshot(),
          });
          return;
        }
        this.send(client.ws, {
          type: "error",
          sessionId: client.sessionId ?? "",
          timestamp: new Date().toISOString(),
          payload: { message: `Unknown resource: ${resource ?? "undefined"}` },
        });
        break;
      }
      case "resource.unsubscribe": {
        break;
      }
      case "node.hello": {
        if (!client.authenticated) {
          this.send(client.ws, {
            type: "error",
            sessionId: "",
            timestamp: new Date().toISOString(),
            payload: { message: "Must authenticate before registering a node", code: "UNAUTHORIZED" },
          });
          return;
        }
        const payload = msg.payload as NodeHelloPayload | undefined;
        if (!payload?.id || !payload.name || !payload.platform) {
          this.send(client.ws, {
            type: "error",
            sessionId: client.sessionId ?? "",
            timestamp: new Date().toISOString(),
            payload: { message: "Invalid node.hello payload" },
          });
          return;
        }
        client.deviceId = client.deviceId ?? payload.id;
        const node = this.nodeStates.upsertNode({
          id: payload.id,
          name: payload.name,
          platform: payload.platform,
          role: payload.role ?? "remote",
          clientId: client.id,
          protocolVersion: payload.protocolVersion ?? NODE_PROTOCOL_VERSION,
          capabilities: payload.capabilities,
        });
        this.broadcastNodeUpdate(node);
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
              const replay = this.currentTerminalStreamEvent(termId);
              this.send(client.ws, {
                type: "surface.connected",
                sessionId: client.sessionId ?? "",
                timestamp: new Date().toISOString(),
                payload: {
                  type: "terminal.output",
                  terminalId: termId,
                  data: buffered,
                  streamId: replay.streamId,
                  seq: replay.seq,
                  replay: true,
                },
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
        if (offer) {
          console.log(`[screen-share] WS offer from client.device=${client.deviceId} host=${offer.hostDeviceId}`);
          // Offer is sent BY the host; relay to all viewers (everyone except the host)
          for (const c of this.clients.values()) {
            if (c.deviceId === client.deviceId) continue;
            if (c.ws.readyState !== 1) continue;
            console.log(`[screen-share]   → relaying offer to device=${c.deviceId}`);
            this.send(c.ws, { type: msg.type as WsEvent["type"], sessionId: "", timestamp: new Date().toISOString(), payload: msg.payload });
          }
        }
        break;
      }
      case "screen-share:answer": {
        const answer = msg.payload as ScreenShareAnswer | undefined;
        if (answer) {
          console.log(`[screen-share] WS answer from client.device=${client.deviceId} viewer=${answer.viewerDeviceId}`);
          // Answer is sent BY the viewer; relay to all non-sender (host)
          for (const c of this.clients.values()) {
            if (c.deviceId === client.deviceId) continue;
            if (c.ws.readyState !== 1) continue;
            console.log(`[screen-share]   → relaying answer to device=${c.deviceId}`);
            this.send(c.ws, { type: msg.type as WsEvent["type"], sessionId: "", timestamp: new Date().toISOString(), payload: msg.payload });
          }
        }
        break;
      }
      case "screen-share:ice-candidate": {
        const ice = msg.payload as ScreenShareIceCandidate | undefined;
        if (ice) {
          // Relay ICE to all non-sender
          for (const c of this.clients.values()) {
            if (c.deviceId === client.deviceId) continue;
            if (c.ws.readyState !== 1) continue;
            this.send(c.ws, { type: msg.type as WsEvent["type"], sessionId: "", timestamp: new Date().toISOString(), payload: msg.payload });
          }
        }
        break;
      }
      case "screen-share:start-request": {
        const startReq = msg.payload as { hostDeviceId: string; sessionId?: string; viewerDeviceIds?: string[] } | undefined;
        if (startReq) {
          console.log(`[screen-share] WS start-request relay from device=${client.deviceId} → host=${startReq.hostDeviceId}`);
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

      // ── Filesystem node protocol ────────────────────────────────
      case "fs.register-node": {
        const p = msg.payload as { id?: string; name?: string; platform?: string; providers?: string[] } | undefined;
        if (p?.id && p.name && p.platform) {
          const node: FsNode = {
            id: p.id,
            name: p.name,
            platform: p.platform as FsNode["platform"],
            clientId: client.id,
            isGateway: false,
            providers: Array.isArray(p.providers) ? p.providers : undefined,
            registeredAt: new Date().toISOString(),
          };
          this.fsNodes.set(node.id, node);
          this.nodeStates.upsertNode({
            id: node.id,
            name: node.name,
            platform: node.platform,
            role: "remote",
            clientId: client.id,
            capabilities: {
              providers: node.providers ?? [],
              surfaces: ["filesystem"],
            },
          });
          console.log(`[ws] fs node registered: ${node.name} (${node.id}) on client ${client.id} — providers: ${node.providers?.join(", ") ?? "none"}`);
          this.onFsNodeRegistered?.(node);
          // Notify all clients so frontends can refresh provider/device lists
          this.broadcastAll({
            type: "fs.node-registered" as WsEvent["type"],
            sessionId: "",
            timestamp: new Date().toISOString(),
            payload: { nodeId: node.id, name: node.name, platform: node.platform, providers: node.providers ?? [] },
          });
          const nodeState = this.nodeStates.getNode(node.id);
          if (nodeState) {
            this.broadcastNodeUpdate(nodeState);
          }
        }
        break;
      }

      // ── Remote provider operation responses ──────────────────────
      case "provider.op-response": {
        const resp = msg.payload as {
          requestId?: string;
          result?: unknown;
          error?: string;
        } | undefined;
        if (resp?.requestId) {
          const pending = this.pendingProviderOps.get(resp.requestId);
          if (pending) {
            this.pendingProviderOps.delete(resp.requestId);
            clearTimeout(pending.timer);
            if (resp.error) {
              pending.reject(new Error(resp.error));
            } else {
              pending.resolve(resp.result);
            }
          }
        }
        break;
      }
      case "provider.event": {
        // A remote node is forwarding a provider event (token, tool.start, etc.)
        const evtPayload = msg.payload as { sessionId?: string; event?: unknown } | undefined;
        if (evtPayload?.sessionId && evtPayload.event && this.onRemoteProviderEvent) {
          const metadata = this.nextOrderedStreamEvent(this.providerStreamState, "provider", evtPayload.sessionId);
          const evtMethod = (evtPayload.event as { method?: string })?.method;
          if (evtMethod && evtMethod !== "item/agentMessage/delta") {
            console.log(`[remote-event] session=${evtPayload.sessionId.slice(0, 8)} method=${evtMethod}`);
          }
          this.onRemoteProviderEvent(evtPayload.sessionId, evtPayload.event, metadata);
        }
        break;
      }
      case "fs.browse-response": {
        // A client responded to a fs browse request we proxied to it
        const resp = msg.payload as {
          requestId?: string;
          path?: string;
          parent?: string | null;
          entries?: FsBrowseEntry[];
          error?: string;
        } | undefined;
        if (resp?.requestId) {
          const pending = this.pendingFsBrowse.get(resp.requestId);
          if (pending) {
            this.pendingFsBrowse.delete(resp.requestId);
            clearTimeout(pending.timer);
            if (resp.error) {
              pending.reject(new Error(resp.error));
            } else {
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
        const resp = msg.payload as {
          requestId?: string;
          roots?: FsBrowseEntry[];
          error?: string;
        } | undefined;
        if (resp?.requestId) {
          const pending = this.pendingFsBrowse.get(resp.requestId);
          if (pending) {
            this.pendingFsBrowse.delete(resp.requestId);
            clearTimeout(pending.timer);
            if (resp.error) {
              pending.reject(new Error(resp.error));
            } else {
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

      // ── Remote tool execution responses ─────────────────────────
      case "tool.op-response": {
        const resp = msg.payload as {
          requestId?: string;
          result?: unknown;
          error?: string;
        } | undefined;
        if (resp?.requestId) {
          const pending = this.pendingToolOps.get(resp.requestId);
          if (pending) {
            this.pendingToolOps.delete(resp.requestId);
            clearTimeout(pending.timer);
            if (resp.error) {
              pending.reject(new Error(resp.error));
            } else {
              pending.resolve(resp.result);
            }
          }
        }
        break;
      }
      case "tool.op-output": {
        const outPayload = msg.payload as {
          requestId?: string;
          chunk?: string;
        } | undefined;
        if (outPayload?.requestId && outPayload.chunk) {
          const pending = this.pendingToolOps.get(outPayload.requestId);
          if (pending?.onOutputChunk) {
            const metadata = this.nextOrderedStreamEvent(this.toolStreamState, "tool", outPayload.requestId);
            pending.onOutputChunk(outPayload.chunk, metadata);
          }
        }
        break;
      }

      // ── Generic fs operation responses (stat, read, write, list) ──
      case "fs.op-response": {
        const resp = msg.payload as {
          requestId?: string;
          result?: unknown;
          error?: string;
        } | undefined;
        if (resp?.requestId) {
          const pending = this.pendingFsOps.get(resp.requestId);
          if (pending) {
            this.pendingFsOps.delete(resp.requestId);
            clearTimeout(pending.timer);
            if (resp.error) {
              pending.reject(new Error(resp.error));
            } else {
              pending.resolve(resp.result);
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
    const stream = this.nextTerminalStreamEvent(terminalId);
    for (const client of this.clients.values()) {
      if (client.terminalSubscriptions.has(terminalId) && client.ws.readyState === 1) {
        this.send(client.ws, {
          type: "surface.connected", // reuse event type
          sessionId: client.sessionId ?? "",
          timestamp: new Date().toISOString(),
          payload: { type: "terminal.output", terminalId, data, streamId: stream.streamId, seq: stream.seq },
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
  /** Callback when a remote node sends a provider event (token, tool.start, etc.) */
  onRemoteProviderEvent?: (sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void;

  /** Called when a filesystem node (desktop/mobile) registers. */
  onFsNodeRegistered?: (node: FsNode) => void;

  private getTerminalStreamState(terminalId: string) {
    let state = this.terminalStreamState.get(terminalId);
    if (!state) {
      state = { nextSeq: 1, streamId: `terminal:${terminalId}` };
      this.terminalStreamState.set(terminalId, state);
    }
    return state;
  }

  private nextTerminalStreamEvent(terminalId: string) {
    const state = this.getTerminalStreamState(terminalId);
    const event = { streamId: state.streamId, seq: state.nextSeq };
    state.nextSeq += 1;
    return event;
  }

  private currentTerminalStreamEvent(terminalId: string) {
    const state = this.getTerminalStreamState(terminalId);
    return { streamId: state.streamId, seq: Math.max(0, state.nextSeq - 1) };
  }

  private nextOrderedStreamEvent(
    stateMap: Map<string, { nextSeq: number; streamId: string }>,
    kind: string,
    id: string,
  ) {
    let state = stateMap.get(id);
    if (!state) {
      state = { nextSeq: 1, streamId: `${kind}:${id}` };
      stateMap.set(id, state);
    }
    const event = { streamId: state.streamId, seq: state.nextSeq };
    state.nextSeq += 1;
    return event;
  }

  // ── Screen sharing helpers ────────────────────────────────────────

  /** Relay a signaling message to a specific device ID */
  private relayToDevice(
    targetDeviceId: string,
    fromDeviceId: string | null,
    msg: { type: string; payload?: unknown },
  ) {
    let sent = false;
    for (const client of this.clients.values()) {
      if (client.deviceId === fromDeviceId) continue;
      if (client.ws.readyState !== 1) continue;
      if (client.deviceId !== targetDeviceId) continue;
      console.log(`[screen-share] relayToDevice: ${msg.type} from=${fromDeviceId} → ${targetDeviceId}`);
      this.send(client.ws, {
        type: msg.type as WsEvent["type"],
        sessionId: "",
        timestamp: new Date().toISOString(),
        payload: msg.payload,
      });
      sent = true;
    }
    if (!sent) {
      const ids = [...this.clients.values()].map(c => c.deviceId).filter(Boolean);
      console.warn(`[screen-share] relayToDevice: target ${targetDeviceId} NOT FOUND, connected=[${ids.join(',')}]`);
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
   * Send a screen-share start-request to the host and viewer devices only.
   * Used by tools/routes when the session is created server-side and the host
   * device needs to be told to begin capture (and viewers to prepare).
   */
  sendScreenShareStartRequest(sessionId: string, hostDeviceId: string, viewerDeviceIds?: string[]) {
    const targets = new Set<string>([hostDeviceId, ...(viewerDeviceIds ?? [])]);
    const allDeviceIds = [...this.clients.values()].map(c => c.deviceId).filter(Boolean);
    console.log(`[screen-share] sendScreenShareStartRequest: session=${sessionId.slice(0, 8)} host=${hostDeviceId} viewers=[${(viewerDeviceIds ?? []).join(',')}] connected=[${allDeviceIds.join(',')}]`);
    let sentCount = 0;
    for (const client of this.clients.values()) {
      if (client.ws.readyState !== 1) continue;
      if (!client.deviceId || !targets.has(client.deviceId)) continue;
      console.log(`[screen-share]   → start-request to device=${client.deviceId}`);
      sentCount++;
      this.send(client.ws, {
        type: "screen-share:start-request" as WsEvent["type"],
        sessionId: "",
        timestamp: new Date().toISOString(),
        payload: { sessionId, hostDeviceId, viewerDeviceIds },
      });
    }
    console.log(`[screen-share]   sent to ${sentCount} client(s)`);
  }

  /** Broadcast an fs.node-disconnected event when a client with FsNodes disconnects. */
  private broadcastFsNodeChange(clientId: string): void {
    // Find FsNodes owned by this client
    for (const [id, node] of this.fsNodes) {
      if (node.clientId === clientId && !node.isGateway) {
        this.fsNodes.delete(id);
        this.broadcastAll({
          type: "fs.node-disconnected" as WsEvent["type"],
          sessionId: "",
          timestamp: new Date().toISOString(),
          payload: { nodeId: id },
        });
        console.log(`[ws] fs node disconnected: ${node.name} (${id}) — client ${clientId} gone`);
      }
    }
  }

  /** Find all connected device IDs */
  getConnectedDeviceIds(): string[] {
    const ids = new Set<string>();
    for (const node of this.nodeStates.listNodes()) {
      if (node.role !== "gateway") ids.add(node.id);
    }
    for (const client of this.clients.values()) {
      if (client.authenticated && client.deviceId) {
        ids.add(client.deviceId);
      }
    }
    return [...ids];
  }

  // ── Filesystem node helpers ─────────────────────────────────────

  /** List all registered filesystem nodes */
  getFsNodes(): FsNode[] {
    // Clean up nodes whose client has disconnected
    for (const [id, node] of this.fsNodes) {
      if (!node.isGateway && !this.clients.has(node.clientId)) {
        this.fsNodes.delete(id);
      }
    }
    return [...this.fsNodes.values()];
  }

  /** Register the gateway itself as a filesystem node */
  registerGatewayFsNode(node: FsNode) {
    this.fsNodes.set(node.id, node);
    this.nodeStates.upsertNode({
      id: node.id,
      name: node.name,
      platform: node.platform,
      role: "gateway",
      clientId: node.clientId,
      isGateway: true,
      capabilities: {
        providers: node.providers ?? [],
        surfaces: ["filesystem"],
      },
    });
  }

  getNodeRegistry(): NodeRegistrySnapshot {
    return this.nodeStates.getSnapshot();
  }

  /**
   * Proxy a browse request to a remote filesystem node.
   * Sends a WS message to the owning client and waits for a response.
   */
  proxyFsBrowse(nodeId: string, path: string): Promise<{ path: string; parent: string | null; entries: FsBrowseEntry[] }> {
    const node = this.fsNodes.get(nodeId);
    if (!node) return Promise.reject(new Error(`Unknown filesystem node: ${nodeId}`));
    if (node.isGateway) return Promise.reject(new Error("Use local browse for gateway node"));
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
        type: "fs.browse-request" as WsEvent["type"],
        sessionId: "",
        timestamp: new Date().toISOString(),
        payload: { requestId, path },
      });
    });
  }

  /**
   * Proxy a roots request to a remote filesystem node.
   */
  proxyFsRoots(nodeId: string): Promise<FsBrowseEntry[]> {
    const node = this.fsNodes.get(nodeId);
    if (!node) return Promise.reject(new Error(`Unknown filesystem node: ${nodeId}`));
    if (node.isGateway) return Promise.reject(new Error("Use local roots for gateway node"));
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
        type: "fs.roots-request" as WsEvent["type"],
        sessionId: "",
        timestamp: new Date().toISOString(),
        payload: { requestId },
      });
    });
  }

  // ── Generic fs operation proxy ──────────────────────────────────────

  /**
   * Send a filesystem operation request to a remote node and wait for the response.
   * Used for stat, read, write, list, exists, readdir, mkdir, etc.
   */
  proxyFsOp<T = unknown>(nodeId: string, op: string, params: Record<string, unknown>, timeoutMs = 30000): Promise<T> {
    const node = this.fsNodes.get(nodeId);
    if (!node) return Promise.reject(new Error(`Unknown filesystem node: ${nodeId}`));
    if (node.isGateway) return Promise.reject(new Error("Use local operations for gateway node"));
    const client = this.clients.get(node.clientId);
    if (!client || client.ws.readyState !== 1) {
      return Promise.reject(new Error(`Node ${nodeId} is not connected`));
    }
    const requestId = nanoid();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFsOps.delete(requestId);
        reject(new Error(`Fs operation '${op}' timed out on node ${nodeId}`));
      }, timeoutMs);
      this.pendingFsOps.set(requestId, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.send(client.ws, {
        type: "fs.op-request" as WsEvent["type"],
        sessionId: "",
        timestamp: new Date().toISOString(),
        payload: { requestId, op, ...params },
      });
    });
  }

  /** Check if a node ID refers to a remote (non-gateway) node */
  isRemoteNode(nodeId: string): boolean {
    if (!nodeId || nodeId === "gateway") return false;
    const node = this.fsNodes.get(nodeId);
    return !!node && !node.isGateway;
  }

  /**
   * Find the remote node whose device ID matches a given filesystem path's origin.
   * Used to route provider operations to the device that owns a repo.
   * Returns undefined if the path belongs to the gateway or no matching node is found.
   */
  findNodeByDeviceId(deviceId: string): FsNode | undefined {
    // Clean up disconnected nodes first
    for (const [id, node] of this.fsNodes) {
      if (!node.isGateway && !this.clients.has(node.clientId)) {
        this.fsNodes.delete(id);
      }
    }
    for (const node of this.fsNodes.values()) {
      if (node.id === deviceId && !node.isGateway) return node;
    }
    return undefined;
  }

  /**
   * Send a tool execution request to a remote node and wait for the result.
   * Used to delegate Jait tool calls (terminal.run, file.write, etc.) to nodes.
   */
  proxyToolOp<T = unknown>(
    nodeId: string,
    tool: string,
    args: Record<string, unknown>,
    options: { timeoutMs?: number; sessionId?: string; workspaceRoot?: string; onOutputChunk?: (chunk: string, metadata?: ToolOutputStreamMetadata) => void } = {},
  ): Promise<T> {
    const { timeoutMs = 120_000, sessionId, workspaceRoot, onOutputChunk } = options;
    const node = this.fsNodes.get(nodeId);
    if (!node) return Promise.reject(new Error(`Unknown node: ${nodeId}`));
    if (node.isGateway) return Promise.reject(new Error("Use local execution for gateway node"));
    const client = this.clients.get(node.clientId);
    if (!client || client.ws.readyState !== 1) {
      return Promise.reject(new Error(`Node ${nodeId} is not connected`));
    }
    const requestId = nanoid();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingToolOps.delete(requestId);
        reject(new Error(`Tool '${tool}' timed out on node ${nodeId}`));
      }, timeoutMs);
      this.pendingToolOps.set(requestId, { resolve: resolve as (v: unknown) => void, reject, timer, onOutputChunk });
      this.send(client.ws, {
        type: "tool.op-request" as WsEvent["type"],
        sessionId: sessionId ?? "",
        timestamp: new Date().toISOString(),
        payload: { requestId, tool, args, sessionId, workspaceRoot },
      });
    });
  }

  /**
   * Send a provider operation request to a remote node and wait for the response.
   * Used by RemoteCliProvider to proxy session lifecycle and turn operations.
   */
  proxyProviderOp<T = unknown>(nodeId: string, op: string, params: Record<string, unknown>, timeoutMs = 60_000): Promise<T> {
    const node = this.fsNodes.get(nodeId);
    if (!node) return Promise.reject(new Error(`Unknown node: ${nodeId}`));
    if (node.isGateway) return Promise.reject(new Error("Use local provider for gateway node"));
    const client = this.clients.get(node.clientId);
    if (!client || client.ws.readyState !== 1) {
      return Promise.reject(new Error(`Node ${nodeId} is not connected`));
    }
    const requestId = nanoid();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingProviderOps.delete(requestId);
        reject(new Error(`Provider operation '${op}' timed out on node ${nodeId}`));
      }, timeoutMs);
      this.pendingProviderOps.set(requestId, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.send(client.ws, {
        type: "provider.op-request" as WsEvent["type"],
        sessionId: "",
        timestamp: new Date().toISOString(),
        payload: { requestId, op, ...params },
      });
    });
  }

  get clientCount() {
    return this.clients.size;
  }

  private send(ws: WebSocket, event: WsEvent) {
    ws.send(JSON.stringify(event));
  }

  private sendNodeRegistrySnapshot(ws: WebSocket) {
    this.send(ws, {
      type: "node.registry",
      sessionId: "",
      timestamp: new Date().toISOString(),
      payload: this.nodeStates.getSnapshot(),
    });
  }

  private broadcastNodeUpdate(node: NodeState) {
    this.broadcastAll({
      type: "node.updated",
      sessionId: "",
      timestamp: new Date().toISOString(),
      payload: node,
    });
  }

  private broadcastDisconnectedNodes(clientId: string) {
    const removed = this.nodeStates.removeNodesByClientId(clientId);
    for (const node of removed) {
      this.broadcastAll({
        type: "node.disconnected",
        sessionId: "",
        timestamp: new Date().toISOString(),
        payload: { nodeId: node.id, node },
      });
    }
  }

  stop() {
    this.wss?.close();
  }
}
