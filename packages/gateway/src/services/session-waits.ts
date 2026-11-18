import { sessionWaitLabel, type SessionWait, type SessionWaitKind } from "@jait/shared";

/**
 * Registry of "this chat is not running right now, and here is why".
 *
 * The chat list needs one answer per chat: *is it working, or is it stopped, and
 * what is it stopped on?* Streaming and chat errors already answer parts of
 * that; this service answers the blocking half. Every place Jait waits on a
 * human reports here:
 *
 * - `user.ask` questions (kind `question`)
 * - tool-consent prompts (kind `consent`)
 * - secret/password prompts (kind `secret`)
 * - the user taking browser control (kind `browser`)
 * - a terminal command parked on an interactive prompt (kind `terminal`)
 * - a background command the agent asked to be woken up for (kind `background`)
 *
 * Raising and clearing both go through a stable `key` (`attentionKey(...)` for
 * request-backed waits), so a prompt answered on one device clears everywhere —
 * the same identity rule the attention layer uses for notifications.
 */
export interface RaiseSessionWaitInput {
  /** Stable identity; clearing uses the same value. */
  key: string;
  kind: SessionWaitKind;
  sessionId: string;
  /** Overrides the default kind label when a caller has something more specific. */
  label?: string;
  detail?: string;
  /** Defaults to true. False only for waits the agent is not blocked on. */
  blocking?: boolean;
}

/** Receives the full wait list for one session whenever that session changes. */
export type SessionWaitBroadcaster = (change: { sessionId: string; waits: SessionWait[] }) => void;

export class SessionWaitService {
  private readonly waits = new Map<string, SessionWait>();
  private broadcaster?: SessionWaitBroadcaster;
  private readonly listeners = new Set<SessionWaitBroadcaster>();

  subscribe(listener: SessionWaitBroadcaster): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  setBroadcaster(broadcaster: SessionWaitBroadcaster | undefined): void {
    this.broadcaster = broadcaster;
  }

  /**
   * Register (or refresh) one reason a chat is stopped. Idempotent: repeating an
   * identical raise does not re-broadcast, which matters because terminal
   * polling and repeated tool calls report the same wait over and over.
   */
  raise(input: RaiseSessionWaitInput): SessionWait {
    const next: SessionWait = {
      key: input.key,
      kind: input.kind,
      sessionId: input.sessionId,
      label: input.label ?? sessionWaitLabel(input.kind),
      ...(input.detail ? { detail: input.detail } : {}),
      blocking: input.blocking ?? true,
    };
    const previous = this.waits.get(next.key);
    this.waits.set(next.key, next);
    if (!previous || !sameWait(previous, next)) this.emit(next.sessionId);
    return next;
  }

  /** Resolve one wait by key. Returns true when something was actually cleared. */
  clear(key: string): boolean {
    const existing = this.waits.get(key);
    if (!existing) return false;
    this.waits.delete(key);
    this.emit(existing.sessionId);
    return true;
  }

  /** Drop every wait for a session (chat finished, deleted, or reset). */
  clearSession(sessionId: string): void {
    let changed = false;
    for (const [key, wait] of this.waits) {
      if (wait.sessionId !== sessionId) continue;
      this.waits.delete(key);
      changed = true;
    }
    if (changed) this.emit(sessionId);
  }

  /** Waits for one session, blocking kinds first. */
  list(sessionId: string): SessionWait[] {
    return [...this.waits.values()]
      .filter((wait) => wait.sessionId === sessionId)
      .sort(compareWaits);
  }

  /** Every outstanding wait, for the reconnect snapshot. */
  snapshot(): SessionWait[] {
    return [...this.waits.values()].sort(compareWaits);
  }

  get(key: string): SessionWait | undefined {
    return this.waits.get(key);
  }

  clearForTests(): void {
    this.waits.clear();
    this.broadcaster = undefined;
  }

  private emit(sessionId: string): void {
    const change = { sessionId, waits: this.list(sessionId) };
    this.broadcaster?.(change);
    for (const listener of this.listeners) listener(change);
  }
}

/** Blocking waits first, then by key so the order is stable across snapshots. */
function compareWaits(a: SessionWait, b: SessionWait): number {
  if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
  if (a.sessionId !== b.sessionId) return a.sessionId.localeCompare(b.sessionId);
  return a.key.localeCompare(b.key);
}

function sameWait(a: SessionWait, b: SessionWait): boolean {
  return (
    a.kind === b.kind &&
    a.sessionId === b.sessionId &&
    a.label === b.label &&
    a.detail === b.detail &&
    a.blocking === b.blocking
  );
}

/** Wait key for a terminal parked on an interactive prompt. */
export function terminalWaitKey(terminalId: string): string {
  return `terminal:${terminalId}`;
}

/** Wait key for "the user holds browser control of this chat". */
export function browserWaitKey(sessionId: string): string {
  return `browser:${sessionId}`;
}

/** Wait key for a background command the agent asked to be woken up for. */
export function backgroundWaitKey(terminalId: string): string {
  return `background:${terminalId}`;
}

/** Process-wide registry; the gateway wires it to the WS control plane. */
export const sessionWaits = new SessionWaitService();
