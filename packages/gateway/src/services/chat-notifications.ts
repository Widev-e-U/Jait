import type { ChatNotificationState } from "@jait/shared";
import type { JaitDB } from "../db/connection.js";
import { SessionStateService } from "./session-state.js";

const KEY = "notification.completion";
interface Entry { userId: string; state: ChatNotificationState }

/** Persist only identity/read metadata. Notification previews never enter this store. */
export class ChatNotificationsService {
  private storage: SessionStateService | null;
  private fallback = new Map<string, Entry>();

  constructor(db?: JaitDB) {
    this.storage = db ? new SessionStateService(db) : null;
  }

  private parse(value: unknown, sessionId: string): Entry | null {
    if (!value || typeof value !== "object") return null;
    const entry = value as Entry;
    const state = entry.state;
    if (typeof entry.userId !== "string" || !entry.userId || !state
        || typeof state.id !== "string" || !state.id || state.id.length > 512
        || state.sessionId !== sessionId || state.replaceId !== `chat-complete:${sessionId}`
        || typeof state.read !== "boolean") return null;
    return { userId: entry.userId, state: {
      id: state.id, sessionId, replaceId: state.replaceId, read: state.read,
    } };
  }

  get(sessionId: string): Entry | null {
    return this.storage
      ? this.parse(this.storage.get(sessionId, [KEY])[KEY], sessionId)
      : this.fallback.get(sessionId) ?? null;
  }

  list(userId: string): ChatNotificationState[] {
    const entries = this.storage
      ? this.storage.getByKey(KEY).map((row) => this.parse(row.value, row.sessionId))
      : [...this.fallback.values()];
    return entries.filter((entry): entry is Entry => entry?.userId === userId).map((entry) => entry.state);
  }

  set(userId: string, state: ChatNotificationState): void {
    const entry = this.parse({ userId, state }, state.sessionId);
    if (!entry) return;
    if (this.storage) this.storage.set(state.sessionId, { [KEY]: entry });
    else {
      this.fallback.delete(state.sessionId);
      this.fallback.set(state.sessionId, entry);
      if (this.fallback.size > 2048) this.fallback.delete(this.fallback.keys().next().value!);
    }
  }
}
