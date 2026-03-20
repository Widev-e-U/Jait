/**
 * Remote CLI Provider — proxies provider operations to a remote desktop node via WS.
 *
 * Instead of spawning a local child process, this adapter sends operations
 * (start-session, send-turn, stop-session, list-models) to a remote Electron
 * desktop client that actually runs the CLI provider (codex / claude-code).
 *
 * Events from the child process are relayed back through the WS control plane
 * via the `provider.event` message type.
 */

import { EventEmitter } from "node:events";
import type {
  CliProviderAdapter,
  ProviderId,
  ProviderInfo,
  ProviderModelInfo,
  ProviderSession,
  ProviderEvent,
  StartSessionOptions,
} from "./contracts.js";
import type { WsControlPlane } from "../ws.js";
import { uuidv7 } from "../db/uuidv7.js";
import { mapCodexNotification } from "./codex-event-mapper.js";

export class RemoteCliProvider implements CliProviderAdapter {
  readonly id: ProviderId;
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  private sessions = new Map<string, ProviderSession>();

  constructor(
    private ws: WsControlPlane,
    private nodeId: string,
    providerId: ProviderId,
  ) {
    this.id = providerId;
    this.info = {
      id: providerId,
      name: `Remote ${providerId}`,
      description: `${providerId} running on remote device ${nodeId}`,
      available: true,
      modes: ["full-access", "supervised"],
    };

    // Listen for events forwarded from the remote node
    const prevHandler = ws.onRemoteProviderEvent;
    ws.onRemoteProviderEvent = (sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => {
      // Call previous handler if present (another RemoteCliProvider)
      if (prevHandler) prevHandler(sessionId, event, metadata);
      this.handleRemoteEvent(sessionId, event);
    };
  }

  async checkAvailability(): Promise<boolean> {
    const node = this.ws.findNodeByDeviceId(this.nodeId);
    if (!node) {
      this.info.available = false;
      this.info.unavailableReason = `Device ${this.nodeId} is not connected`;
      return false;
    }
    const hasProvider = node.providers?.includes(
      this.id === "claude-code" ? "claude-code" : this.id,
    );
    this.info.available = !!hasProvider;
    if (!hasProvider) {
      this.info.unavailableReason = `Provider ${this.id} not available on device ${this.nodeId}`;
    }
    return this.info.available;
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    try {
      const result = await this.ws.proxyProviderOp<ProviderModelInfo[]>(
        this.nodeId,
        "list-models",
        { providerId: this.id },
        30_000,
      );
      return Array.isArray(result) ? result : [];
    } catch {
      return [];
    }
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = uuidv7();

    const session: ProviderSession = {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "starting",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, session);

    try {
      const result = await this.ws.proxyProviderOp<{
        ok: boolean;
        providerThreadId?: string;
      }>(this.nodeId, "start-session", {
        sessionId,
        providerId: this.id,
        workingDirectory: options.workingDirectory,
        mode: options.mode,
        model: options.model,
        env: options.env,
        mcpServers: options.mcpServers,
      }, 90_000);

      session.status = "running";
      this.emit({ type: "session.started", sessionId });

      // Store the remote provider thread ID on the session for send-turn
      if (result?.providerThreadId) {
        (session as ProviderSession & { providerThreadId?: string }).providerThreadId = result.providerThreadId;
      }

      return session;
    } catch (err) {
      session.status = "error";
      session.error = err instanceof Error ? err.message : "Remote session start failed";
      this.sessions.delete(sessionId);
      this.emit({ type: "session.error", sessionId, error: session.error });
      throw err;
    }
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    const session = this.sessions.get(sessionId) as (ProviderSession & { providerThreadId?: string }) | undefined;
    if (!session) throw new Error(`Session ${sessionId} not found`);

    await this.ws.proxyProviderOp(this.nodeId, "send-turn", {
      sessionId,
      message,
      providerThreadId: session.providerThreadId ?? sessionId,
    }, 120_000);
  }

  async interruptTurn(sessionId: string): Promise<void> {
    // Send a stop and mark as interrupted
    await this.stopSession(sessionId);
    const session = this.sessions.get(sessionId);
    if (session) session.status = "interrupted";
  }

  async respondToApproval(_sessionId: string, _requestId: string, _approved: boolean): Promise<void> {
    // Remote approval not yet supported — could be proxied in the future
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    try {
      await this.ws.proxyProviderOp(this.nodeId, "stop-session", { sessionId }, 15_000);
    } catch {
      // Ignore — child may already be dead
    }
    if (session) {
      session.status = "completed";
      session.completedAt = new Date().toISOString();
    }
    this.sessions.delete(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  /**
   * Handle a remote event relayed from the client via WS.
   * Uses the shared codex event mapper to translate raw JSON-RPC notifications.
   */
  private handleRemoteEvent(sessionId: string, event: unknown): void {
    if (!this.sessions.has(sessionId)) return;

    const directEvent = this.parseDirectProviderEvent(event, sessionId);
    if (directEvent) {
      this.emit(directEvent);
      if (directEvent.type === "session.completed" || directEvent.type === "session.error") {
        this.sessions.delete(sessionId);
      }
      return;
    }

    const e = event as { method?: string; params?: Record<string, unknown> };
    if (!e.method) return;

    const params = (e.params ?? {}) as Record<string, unknown>;
    const events = mapCodexNotification(e.method, params, sessionId);

    for (const evt of events) {
      this.emit(evt);
      if (evt.type === "session.completed") {
        this.sessions.delete(sessionId);
      }
    }
  }

  private parseDirectProviderEvent(event: unknown, sessionId: string): ProviderEvent | null {
    if (!event || typeof event !== "object") return null;

    const candidate = event as Partial<ProviderEvent> & { type?: unknown; sessionId?: unknown };
    if (typeof candidate.type !== "string") return null;
    if (typeof candidate.sessionId === "string" && candidate.sessionId !== sessionId) return null;

    return { ...candidate, sessionId } as ProviderEvent;
  }
}
