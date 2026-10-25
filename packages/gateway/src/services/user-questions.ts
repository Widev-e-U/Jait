import { uuidv7 } from "../db/uuidv7.js";

export interface UserQuestionOption {
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface UserQuestion {
  id: string;
  header: string;
  question: string;
  multiSelect?: boolean;
  options?: UserQuestionOption[];
  allowFreeformInput?: boolean;
}

export interface UserQuestionAnswer {
  selected: string[];
  freeText: string | null;
  skipped: boolean;
}

export interface UserQuestionRequest {
  id: string;
  sessionId: string;
  userId: string | null;
  requestedBy: string | null;
  title: string;
  attention: "normal" | "urgent";
  questions: UserQuestion[];
  createdAt: string;
  expiresAt: null;
  status: "pending" | "submitted" | "cancelled";
}

export interface UserQuestionResult {
  answers: Record<string, UserQuestionAnswer>;
}

interface PendingUserQuestion {
  request: UserQuestionRequest;
  resolve: (value: UserQuestionResult | null) => void;
}

export interface UserQuestionServiceOptions {
  onRequest?: (request: UserQuestionRequest) => void;
  onResolved?: (request: UserQuestionRequest) => void;
}

export type UserQuestionWaitResult =
  | { status: "pending" }
  | { status: "missing" }
  | { status: "answered"; result: UserQuestionResult | null };

type UserQuestionInput = {
  sessionId: string;
  userId?: string | null;
  requestedBy?: string | null;
  title?: string;
  attention?: "normal" | "urgent";
  questions: UserQuestion[];
};

export class UserQuestionService {
  // MCP clients impose per-call deadlines. Keep the answer until the same
  // owner/session collects it, even if it arrives between wait calls.
  private readonly resumable = new Map<string, {
    sessionId: string;
    userId: string | null;
    result: Promise<UserQuestionResult | null>;
    waiters: number;
    yielded: boolean;
  }>();
  private readonly pending = new Map<string, PendingUserQuestion>();
  private readonly onRequest?: (request: UserQuestionRequest) => void;
  private readonly onResolved?: (request: UserQuestionRequest) => void;

  // Only detached MCP waits need a new turn; an attached tool resumes itself.
  onDetachedResolved?: (request: UserQuestionRequest) => void;

  constructor(options: UserQuestionServiceOptions = {}) {
    this.onRequest = options.onRequest;
    this.onResolved = options.onResolved;
  }

  ask(input: UserQuestionInput): Promise<UserQuestionResult | null> {
    return this.createRequest(input).result;
  }

  startResumable(input: UserQuestionInput): string {
    const { request, result } = this.createRequest(input);
    this.resumable.set(request.id, {
      sessionId: request.sessionId, userId: request.userId, result, waiters: 0, yielded: false,
    });
    return request.id;
  }

  async waitForAnswer(requestId: string, sessionId: string, userId?: string | null, options: { yieldAfterMs?: number | null } = {}): Promise<UserQuestionWaitResult> {
    const entry = this.resumable.get(requestId);
    if (!entry || entry.sessionId !== sessionId || entry.userId !== (userId ?? null)) {
      return { status: "missing" };
    }
    entry.waiters += 1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = options.yieldAfterMs === null
        ? { status: "answered" as const, result: await entry.result }
        : await Promise.race([
          entry.result.then(result => ({ status: "answered" as const, result })),
          new Promise<{ status: "pending" }>(resolve => {
            timer = setTimeout(() => resolve({ status: "pending" }), options.yieldAfterMs ?? 60_000);
          }),
        ]);
      if (outcome.status === "answered") this.resumable.delete(requestId);
      else entry.yielded = true;
      return outcome;
    } finally {
      clearTimeout(timer);
      entry.waiters -= 1;
    }
  }

  private createRequest(input: UserQuestionInput): {
    request: UserQuestionRequest;
    result: Promise<UserQuestionResult | null>;
  } {
    const now = new Date();
    const request: UserQuestionRequest = {
      id: uuidv7(),
      sessionId: input.sessionId,
      userId: input.userId ?? null,
      requestedBy: input.requestedBy ?? null,
      title: input.title?.trim() || "Input requested",
      attention: input.attention === "urgent" ? "urgent" : "normal",
      questions: input.questions,
      createdAt: now.toISOString(),
      expiresAt: null,
      status: "pending",
    };

    const result = new Promise<UserQuestionResult | null>((resolve) => {
      this.pending.set(request.id, { request, resolve });
      this.onRequest?.(request);
    });
    return { request, result };
  }

  listPending(sessionId?: string, userId?: string | null): UserQuestionRequest[] {
    return [...this.pending.values()]
      .map((entry) => entry.request)
      .filter((request) => {
        if (sessionId && request.sessionId !== sessionId) return false;
        if (userId && request.userId && request.userId !== userId) return false;
        return true;
      });
  }

  submit(requestId: string, result: UserQuestionResult, userId?: string | null): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    if (entry.request.userId && entry.request.userId !== (userId ?? null)) return false;
    this.resolveRequest(requestId, result, "submitted");
    return true;
  }

  cancel(requestId: string, userId?: string | null): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    if (entry.request.userId && entry.request.userId !== (userId ?? null)) return false;
    this.resolveRequest(requestId, null, "cancelled");
    return true;
  }

  private resolveRequest(
    requestId: string,
    result: UserQuestionResult | null,
    status: UserQuestionRequest["status"],
  ): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    this.pending.delete(requestId);
    const request = { ...entry.request, status };
    entry.resolve(result);
    this.onResolved?.(request);
    const resumable = this.resumable.get(requestId);
    if (resumable?.yielded && resumable.waiters === 0) this.onDetachedResolved?.(request);
  }
}
