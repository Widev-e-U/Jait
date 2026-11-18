export const CLI_USER_IDLE_TIMEOUT_MS = 10 * 60_000;

interface IdleSession {
  threadId: string;
  lastUserMessageAt: number;
  isBusy: () => boolean;
  expire: () => Promise<void>;
}

/** Only human messages extend the lease; tokens, tools and automatic turns do not. */
export class CliSessionIdleTracker {
  private readonly sessions = new Map<string, IdleSession>();
  private readonly userMessages = new Map<string, number>();
  private timer?: ReturnType<typeof setInterval>;

  recordUserMessage(threadId: string): void {
    const now = Date.now();
    this.pruneMessages(now);
    this.userMessages.set(threadId, now);
    for (const session of this.sessions.values()) {
      if (session.threadId === threadId) session.lastUserMessageAt = now;
    }
  }

  watch(id: string, threadId: string, isBusy: () => boolean, expire: () => Promise<void>): void {
    this.pruneMessages(Date.now());
    this.sessions.set(id, {
      threadId,
      lastUserMessageAt: this.userMessages.get(threadId) ?? Date.now(),
      isBusy,
      expire,
    });
    this.timer ??= setInterval(() => this.reap(), 5_000);
    this.timer.unref();
  }

  forget(id: string): void {
    this.sessions.delete(id);
    if (this.sessions.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  reap(now = Date.now()): void {
    this.pruneMessages(now);
    for (const [id, session] of this.sessions) {
      if (now - session.lastUserMessageAt < CLI_USER_IDLE_TIMEOUT_MS || session.isBusy()) continue;
      // Retire synchronously before awaiting teardown: a new message must open
      // a fresh session, never reuse a process already being closed.
      this.forget(id);
      void session.expire().catch(error => console.warn("[cli/idle] Session cleanup failed", error));
    }
  }

  private pruneMessages(now: number): void {
    for (const [id, at] of this.userMessages) {
      if (now - at >= CLI_USER_IDLE_TIMEOUT_MS) this.userMessages.delete(id);
    }
  }
}

export const cliSessionIdle = new CliSessionIdleTracker();
