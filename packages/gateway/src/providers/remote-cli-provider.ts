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
  ProviderAuthStatus,
  ProviderLoginResult,
  ProviderLogoutResult,
  ProviderModelInfo,
  ProviderSession,
  ProviderEvent,
  StartSessionOptions,
} from "./contracts.js";
import type { WsControlPlane } from "../ws.js";
import { uuidv7 } from "../db/uuidv7.js";
import { mapCodexNotification } from "./codex-event-mapper.js";
import { DEVICE_PROVIDER_AUTH } from "./provider-auth.js";

type RemoteProviderEventMetadata = { streamId: string; seq: number };
type RemoteProviderEventHandler = (
  sessionId: string,
  event: unknown,
  metadata?: RemoteProviderEventMetadata,
) => void;

interface RemoteProviderEventDispatcher {
  previous?: RemoteProviderEventHandler;
  listeners: Set<RemoteProviderEventHandler>;
}

const remoteProviderEventDispatchers = new WeakMap<WsControlPlane, RemoteProviderEventDispatcher>();

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeCodexModelList(result: unknown): ProviderModelInfo[] {
  const response = asRecord(result);
  const rawModels = Array.isArray(result)
    ? result
    : Array.isArray(response?.data)
      ? response.data
      : [];

  return rawModels.flatMap((rawModel) => {
    const model = asRecord(rawModel);
    if (!model || model.hidden === true) return [];

    const id = asNonEmptyString(model.id) ?? asNonEmptyString(model.model);
    if (!id) return [];

    const name = asNonEmptyString(model.displayName)
      ?? asNonEmptyString(model.name)
      ?? id;
    const description = asNonEmptyString(model.description) ?? undefined;
    const supportedReasoningEfforts = Array.isArray(model.supportedReasoningEfforts)
      ? model.supportedReasoningEfforts.flatMap((rawEffort) => {
        const effort = asRecord(rawEffort);
        const reasoningEffort = effort ? asNonEmptyString(effort.reasoningEffort) : undefined;
        if (!reasoningEffort) return [];
        const effortDescription = effort ? asNonEmptyString(effort.description) ?? undefined : undefined;
        return [{
          reasoningEffort,
          ...(effortDescription ? { description: effortDescription } : {}),
        }];
      })
      : undefined;
    const reasoningEffortSupported = supportedReasoningEfforts
      ? supportedReasoningEfforts.length > 0
      : undefined;

    return [{
      id,
      name,
      ...(description ? { description } : {}),
      ...(typeof model.isDefault === "boolean" ? { isDefault: model.isDefault } : {}),
      ...(reasoningEffortSupported !== undefined ? { reasoningEffortSupported } : {}),
      ...(supportedReasoningEfforts?.length ? { supportedReasoningEfforts } : {}),
    }];
  });
}

function registerRemoteProviderEventListener(
  ws: WsControlPlane,
  listener: RemoteProviderEventHandler,
): () => void {
  let dispatcher = remoteProviderEventDispatchers.get(ws);
  if (!dispatcher) {
    const previous = ws.onRemoteProviderEvent;
    dispatcher = {
      previous,
      listeners: new Set(),
    };
    ws.onRemoteProviderEvent = (sessionId, event, metadata) => {
      previous?.(sessionId, event, metadata);
      const currentDispatcher = remoteProviderEventDispatchers.get(ws);
      if (!currentDispatcher) return;
      for (const currentListener of Array.from(currentDispatcher.listeners)) {
        currentListener(sessionId, event, metadata);
      }
    };
    remoteProviderEventDispatchers.set(ws, dispatcher);
  }

  dispatcher.listeners.add(listener);
  return () => {
    dispatcher?.listeners.delete(listener);
  };
}

export class RemoteCliProvider implements CliProviderAdapter {
  readonly id: ProviderId;
  readonly providerType: ProviderId;
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  private sessions = new Map<string, ProviderSession>();
  private remoteEventUnsubscribe: (() => void) | null = null;
  private readonly remoteEventListener: RemoteProviderEventHandler = (sessionId, event) => {
    this.handleRemoteEvent(sessionId, event);
  };

  constructor(
    private ws: WsControlPlane,
    private nodeId: string,
    providerId: ProviderId,
    providerType: ProviderId = providerId,
  ) {
    this.id = providerId;
    this.providerType = providerType;
    this.info = {
      id: providerId,
      providerType,
      name: `Remote ${providerId}`,
      description: `${providerId} running on remote device ${nodeId}`,
      available: true,
      modes: ["full-access", "supervised"],
      auth: DEVICE_PROVIDER_AUTH,
    };
  }

  async checkAvailability(): Promise<boolean> {
    const node = this.ws.findNodeByDeviceId(this.nodeId);
    if (!node) {
      this.info.available = false;
      this.info.unavailableReason = `Device ${this.nodeId} is not connected`;
      return false;
    }
    const hasProvider = node.providers?.includes(this.providerType);
    this.info.available = !!hasProvider;
    if (!hasProvider) {
      this.info.unavailableReason = `Provider ${this.providerType} not available on device ${this.nodeId}`;
    }
    return this.info.available;
  }

  async getAuthStatus(): Promise<ProviderAuthStatus> {
    return this.ws.proxyProviderOp<ProviderAuthStatus>(this.nodeId, "auth-status", {
      providerId: this.id,
      providerType: this.providerType,
    });
  }

  async startLogin(): Promise<ProviderLoginResult> {
    return this.ws.proxyProviderOp<ProviderLoginResult>(this.nodeId, "start-login", {
      providerId: this.id,
      providerType: this.providerType,
    }, 90_000);
  }

  sendLoginInput(input: string): void {
    void this.ws.proxyProviderOp(this.nodeId, "login-input", {
      providerId: this.id,
      providerType: this.providerType,
      input,
    });
  }

  async logout(): Promise<ProviderLogoutResult> {
    return this.ws.proxyProviderOp<ProviderLogoutResult>(this.nodeId, "logout", {
      providerId: this.id,
      providerType: this.providerType,
    }, 90_000);
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    try {
      const result = await this.ws.proxyProviderOp<ProviderModelInfo[]>(
        this.nodeId,
        "list-models",
        { providerId: this.id, providerType: this.providerType },
        90_000,
      );
      if (this.providerType === "codex") {
        return normalizeCodexModelList(result);
      }
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
    this.ensureRemoteEventSubscription();

    try {
      const result = await this.ws.proxyProviderOp<{
        ok: boolean;
        providerThreadId?: string;
      }>(this.nodeId, "start-session", {
        sessionId,
        providerId: this.id,
        providerType: this.providerType,
        workingDirectory: options.workingDirectory,
        mode: options.mode,
        model: options.model,
        reasoningEffort: options.reasoningEffort,
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
      this.detachRemoteEventSubscriptionIfIdle();
      this.emit({ type: "session.error", sessionId, error: session.error });
      throw err;
    }
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    const session = this.sessions.get(sessionId) as (ProviderSession & { providerThreadId?: string }) | undefined;
    if (!session) throw new Error(`Session ${sessionId} not found`);

    let cleanupCompletion = () => {};
    const completion = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        cleanupCompletion();
        this.emit({
          type: "session.error",
          sessionId,
          error: `Remote ${this.id} turn timed out waiting for completion`,
        });
        resolve();
      }, 30 * 60 * 1000);
      const handler = (event: ProviderEvent) => {
        if (event.sessionId !== sessionId) return;
        if (event.type === "turn.completed" || event.type === "session.completed" || event.type === "session.error") {
          cleanupCompletion();
          resolve();
        }
      };
      cleanupCompletion = () => {
        clearTimeout(timeout);
        this.emitter.off("event", handler);
      };
      this.emitter.on("event", handler);
    });

    let completedFromEvent = false;
    const eventCompletion = completion.then(() => { completedFromEvent = true; });
    try {
      const result = await this.ws.proxyProviderOp<{ completed?: boolean }>(this.nodeId, "send-turn", {
        sessionId,
        message,
        providerThreadId: session.providerThreadId ?? sessionId,
      }, 30 * 60 * 1000 + 30_000);
      if (result?.completed && !completedFromEvent) {
        cleanupCompletion();
        this.emit({ type: "turn.completed", sessionId });
        return;
      }
    } catch (err) {
      cleanupCompletion();
      throw err;
    }
    await eventCompletion;
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
    const result = await this.ws.proxyProviderOp<{ stopped?: boolean }>(
      this.nodeId,
      "stop-session",
      { sessionId },
      15_000,
    );
    if (result?.stopped === false) {
      throw new Error(`Remote session ${sessionId} is no longer tracked on device ${this.nodeId}`);
    }
    if (session) {
      session.status = "completed";
      session.completedAt = new Date().toISOString();
    }
    this.sessions.delete(sessionId);
    this.detachRemoteEventSubscriptionIfIdle();
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private ensureRemoteEventSubscription(): void {
    if (this.remoteEventUnsubscribe) return;
    this.remoteEventUnsubscribe = registerRemoteProviderEventListener(this.ws, this.remoteEventListener);
  }

  private detachRemoteEventSubscriptionIfIdle(): void {
    if (this.sessions.size > 0 || !this.remoteEventUnsubscribe) return;
    this.remoteEventUnsubscribe();
    this.remoteEventUnsubscribe = null;
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
        this.detachRemoteEventSubscriptionIfIdle();
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
        this.detachRemoteEventSubscriptionIfIdle();
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
