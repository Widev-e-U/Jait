import { uuidv7 } from "../db/uuidv7.js";

export interface SecretInputRequest {
  id: string;
  sessionId: string;
  userId: string | null;
  title: string;
  prompt: string;
  requestedBy: string | null;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "submitted" | "cancelled" | "timeout";
}

interface PendingSecret {
  request: SecretInputRequest;
  resolve: (value: string | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface SecretInputServiceOptions {
  defaultTimeoutMs?: number;
  onRequest?: (request: SecretInputRequest) => void;
  onResolved?: (request: SecretInputRequest) => void;
}

export class SecretInputService {
  private readonly pending = new Map<string, PendingSecret>();
  private readonly defaultTimeoutMs: number;
  private readonly onRequest?: (request: SecretInputRequest) => void;
  private readonly onResolved?: (request: SecretInputRequest) => void;

  constructor(options: SecretInputServiceOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 120_000;
    this.onRequest = options.onRequest;
    this.onResolved = options.onResolved;
  }

  requestSecret(input: {
    sessionId: string;
    userId?: string | null;
    title: string;
    prompt: string;
    requestedBy?: string | null;
    timeoutMs?: number;
  }): Promise<string | null> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.timeoutMs ?? this.defaultTimeoutMs));
    const request: SecretInputRequest = {
      id: uuidv7(),
      sessionId: input.sessionId,
      userId: input.userId ?? null,
      title: input.title,
      prompt: input.prompt,
      requestedBy: input.requestedBy ?? null,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: "pending",
    };

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.resolveRequest(request.id, null, "timeout");
      }, input.timeoutMs ?? this.defaultTimeoutMs);
      this.pending.set(request.id, { request, resolve, timer });
      this.onRequest?.(request);
    });
  }

  listPending(sessionId?: string, userId?: string | null): SecretInputRequest[] {
    return [...this.pending.values()]
      .map((entry) => entry.request)
      .filter((request) => {
        if (sessionId && request.sessionId !== sessionId) return false;
        if (userId && request.userId && request.userId !== userId) return false;
        return true;
      });
  }

  submit(requestId: string, value: string, userId?: string | null): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    if (entry.request.userId && userId && entry.request.userId !== userId) return false;
    this.resolveRequest(requestId, value, "submitted");
    return true;
  }

  cancel(requestId: string, userId?: string | null): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    if (entry.request.userId && userId && entry.request.userId !== userId) return false;
    this.resolveRequest(requestId, null, "cancelled");
    return true;
  }

  private resolveRequest(
    requestId: string,
    value: string | null,
    status: SecretInputRequest["status"],
  ): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    this.pending.delete(requestId);
    clearTimeout(entry.timer);
    const request = { ...entry.request, status };
    entry.resolve(value);
    this.onResolved?.(request);
  }
}
