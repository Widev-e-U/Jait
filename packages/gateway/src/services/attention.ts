/**
 * AttentionService — the single source of truth for "a chat is waiting on the user".
 *
 * Every blocking interaction (a tool consent prompt, a `user.ask` question) is
 * raised here as one AttentionItem carrying a stable `key`. Clients reuse that
 * key as their *native* notification identity:
 *
 *   - Android  → NotificationManager notification id (key.hashCode())
 *   - Wear     → DataClient item path
 *   - Electron → key in the live Notification map, so `.close()` can find it
 *   - Web      → `tag` on ServiceWorkerRegistration.showNotification
 *
 * Because the identity is shared, resolving the request on *any* device emits a
 * single `attention.cleared` fan-out that revokes the notification everywhere
 * else. That is the property the old per-platform notification calls could not
 * provide: they minted throwaway ids (`notif-${Date.now()}`) that nothing could
 * later address.
 */

import { attentionKey, type AttentionKind } from "@jait/shared";
import type { ClientSurface, WsControlPlane } from "../ws.js";

export { attentionKey };
export type { AttentionKind };

/** How a client should react when the user activates this action. */
export type AttentionActionKind = "approve" | "reject" | "select" | "reply";

export interface AttentionAction {
  /** Stable within the item; echoed back verbatim when the user activates it. */
  id: string;
  label: string;
  kind: AttentionActionKind;
}

export interface AttentionItem {
  /** Stable native-notification identity, unique per open request. */
  key: string;
  kind: AttentionKind;
  /** Underlying consent request id / user-question request id. */
  requestId: string;
  sessionId: string;
  /** Null when the request could not be attributed to a user (no push target). */
  userId: string | null;
  title: string;
  body: string;
  /** Drives heads-up / full-screen presentation and FCM priority. */
  urgent: boolean;
  /** Inline actions the notification can offer, in display order. */
  actions: AttentionAction[];
  /** Deep link into the Jait UI for the "just open it" path. */
  link: string;
  /**
   * The originating request (consent request / user-question request). Clients
   * that render a full prompt UI — the Android activity, the watch card — need
   * the questions and options, and a push arriving while the app is asleep has
   * no session to fetch them from.
   */
  detail?: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
}

/** Reason an item stopped needing attention — clients may show it or stay silent. */
export type AttentionClearedReason = "answered" | "cancelled" | "timeout" | "superseded";

export interface AttentionCleared {
  key: string;
  kind: AttentionKind;
  requestId: string;
  sessionId: string;
  userId: string | null;
  reason: AttentionClearedReason;
  /** Which device resolved it, when known, so that device can skip its own revoke. */
  resolvedBy: string | null;
  clearedAt: string;
}

/**
 * What a client actually receives. `native` answers the only question a client
 * cannot answer on its own: "am I the surface that should raise an OS-level
 * notification, or is a better-placed client on this machine already doing it?"
 * Clients with `native: false` still get the item and should render it in-app.
 */
export interface AttentionRaisedPayload extends AttentionItem {
  native: boolean;
}

/**
 * Electron owns its machine. It has real OS notifications with inline actions
 * and it keeps running when the window is closed to the tray, so whenever a
 * desktop client is connected the browser tab stays silent — otherwise the same
 * PC pops two toasts for one request. Every other surface is a physically
 * separate device the user explicitly wants buzzed.
 */
export function shouldNotifyNatively(
  surface: ClientSurface,
  liveSurfaces: ReadonlySet<ClientSurface>,
): boolean {
  if (surface === "web") return !liveSurfaces.has("desktop");
  return true;
}

/** Extra delivery path (FCM, messaging channel, …) for attention fan-out. */
export interface AttentionSink {
  raised(item: AttentionItem): void | Promise<void>;
  cleared(event: AttentionCleared): void | Promise<void>;
}

export interface AttentionServiceOptions {
  /** Resolves the owning user for a session, for push targeting. */
  resolveUserId?: (sessionId: string) => string | null;
}

/** Consent prompts are always the same binary choice. */
export const CONSENT_ATTENTION_ACTIONS: AttentionAction[] = [
  { id: "approve", label: "Approve", kind: "approve" },
  { id: "reject", label: "Reject", kind: "reject" },
];

/**
 * Notification action rows are tightly capped by every platform (Android shows
 * 3, Windows toasts 5, web notifications 2 on most browsers), so only the first
 * question's options become buttons — anything richer falls back to opening the
 * app. A freeform question instead offers a single inline-reply action.
 */
export function attentionActionsForQuestion(request: {
  questions: Array<{
    id: string;
    options?: Array<{ label: string }>;
    allowFreeformInput?: boolean;
    multiSelect?: boolean;
  }>;
}): AttentionAction[] {
  const first = request.questions[0];
  if (!first || request.questions.length > 1) return [];
  if (first.options?.length && !first.multiSelect) {
    return first.options.slice(0, 3).map((option) => ({
      id: `${first.id}:${option.label}`,
      label: option.label,
      kind: "select" as const,
    }));
  }
  if (first.allowFreeformInput) {
    return [{ id: first.id, label: "Reply", kind: "reply" }];
  }
  return [];
}

export class AttentionService {
  private readonly open = new Map<string, AttentionItem>();
  private readonly sinks: AttentionSink[] = [];
  private readonly resolveUserId?: (sessionId: string) => string | null;

  constructor(private readonly ws: WsControlPlane, options: AttentionServiceOptions = {}) {
    this.resolveUserId = options.resolveUserId;
  }

  addSink(sink: AttentionSink): () => void {
    this.sinks.push(sink);
    return () => {
      const index = this.sinks.indexOf(sink);
      if (index >= 0) this.sinks.splice(index, 1);
    };
  }

  /** Currently open items, optionally narrowed to one user. */
  list(userId?: string | null): AttentionItem[] {
    const items = [...this.open.values()];
    if (!userId) return items;
    return items.filter((item) => item.userId === userId);
  }

  get(key: string): AttentionItem | undefined {
    return this.open.get(key);
  }

  /**
   * Raise (or refresh) an attention item and fan it out. Re-raising an existing
   * key replaces the item rather than stacking a second notification, so a
   * reconnecting provider cannot double-notify.
   */
  raise(input: Omit<AttentionItem, "key" | "userId" | "createdAt"> & {
    userId?: string | null;
    createdAt?: string;
  }): AttentionItem {
    const key = attentionKey(input.kind, input.requestId);
    const item: AttentionItem = {
      ...input,
      key,
      userId: input.userId ?? this.resolveUserId?.(input.sessionId) ?? null,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    this.open.set(key, item);

    const liveSurfaces = this.ws.liveSurfaces(item.userId);
    this.ws.broadcastBySurface(item.userId, (surface) => ({
      type: "attention.raised",
      sessionId: item.sessionId,
      timestamp: item.createdAt,
      payload: { ...item, native: shouldNotifyNatively(surface, liveSurfaces) },
    }));

    this.dispatch((sink) => sink.raised(item));
    return item;
  }

  /**
   * Clear an item everywhere. No-ops for unknown keys so double-resolution
   * (e.g. the watch answers just as the request times out) stays quiet.
   */
  clear(
    kind: AttentionKind,
    requestId: string,
    reason: AttentionClearedReason,
    resolvedBy?: string | null,
  ): AttentionCleared | null {
    const key = attentionKey(kind, requestId);
    const item = this.open.get(key);
    if (!item) return null;
    this.open.delete(key);

    const event: AttentionCleared = {
      key,
      kind,
      requestId,
      sessionId: item.sessionId,
      userId: item.userId,
      reason,
      resolvedBy: resolvedBy ?? null,
      clearedAt: new Date().toISOString(),
    };

    this.broadcast(item.userId, {
      type: "attention.cleared",
      sessionId: item.sessionId,
      timestamp: event.clearedAt,
      payload: event,
    });

    this.dispatch((sink) => sink.cleared(event));
    return event;
  }

  /**
   * Fan-out is best-effort and synchronous per sink, so a sink that throws (or
   * a transport that is down) can never stop the remaining ones — or the WS
   * broadcast that already went out — from delivering.
   */
  private dispatch(deliver: (sink: AttentionSink) => void | Promise<void>): void {
    for (const sink of this.sinks) {
      try {
        void Promise.resolve(deliver(sink)).catch(() => { /* fire-and-forget */ });
      } catch { /* fire-and-forget */ }
    }
  }

  /**
   * Attributed items go only to that user's clients; unattributed ones fall back
   * to a global broadcast so a single-user local gateway still notifies.
   */
  private broadcast(userId: string | null, event: Parameters<WsControlPlane["broadcastAll"]>[0]): void {
    if (userId) this.ws.broadcastToUser(userId, event);
    else this.ws.broadcastAll(event);
  }
}
