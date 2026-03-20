/**
 * Shared types for agent threads and CLI providers.
 *
 * These types are consumed by both the gateway (backend) and
 * the web app (frontend) for the parallel-agents UI.
 */

// ── Provider identity ────────────────────────────────────────────────

export type ProviderId = "jait" | "codex" | "claude-code" | "gemini" | "opencode" | "copilot";

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  description: string;
  available: boolean;
  unavailableReason?: string;
  modes: RuntimeMode[];
}

export type RuntimeMode = "full-access" | "supervised";
export type ThreadKind = "delivery" | "delegation";

// ── Thread status ────────────────────────────────────────────────────

export type ThreadStatus =
  | "running"
  | "completed"
  | "error"
  | "interrupted";

// ── Thread info (DB row shape) ───────────────────────────────────────

export interface ThreadInfo {
  id: string;
  userId: string | null;
  sessionId: string | null;
  title: string;
  providerId: ProviderId;
  model: string | null;
  runtimeMode: RuntimeMode;
  kind: ThreadKind;
  workingDirectory: string | null;
  branch: string | null;
  status: ThreadStatus;
  providerSessionId: string | null;
  error: string | null;
  prUrl: string | null;
  prNumber: number | null;
  prTitle: string | null;
  prState: "creating" | "open" | "closed" | "merged" | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

// ── Thread activity ──────────────────────────────────────────────────

export type ThreadActivityKind =
  | "tool.start"
  | "tool.result"
  | "tool.error"
  | "tool.approval"
  | "message"
  | "error"
  | "session"
  | "activity";

export interface ThreadActivity {
  id: string;
  threadId: string;
  kind: string; // ThreadActivityKind or custom
  summary: string;
  payload?: unknown;
  createdAt: string;
}

// ── Create / Update params ───────────────────────────────────────────

export interface CreateThreadParams {
  sessionId?: string;
  title: string;
  providerId: ProviderId;
  model?: string;
  runtimeMode?: RuntimeMode;
  kind?: ThreadKind;
  workingDirectory?: string;
  branch?: string;
}

export interface UpdateThreadParams {
  title?: string;
  model?: string;
  runtimeMode?: RuntimeMode;
  kind?: ThreadKind;
  workingDirectory?: string;
  branch?: string;
  prUrl?: string | null;
  prNumber?: number | null;
  prTitle?: string | null;
  prState?: "creating" | "open" | "closed" | "merged" | null;
}

// ── Thread WS events ────────────────────────────────────────────────

export type ThreadWsEventType =
  | "thread.created"
  | "thread.updated"
  | "thread.deleted"
  | "thread.status"
  | "thread.activity";

export interface ThreadWsEvent {
  type: ThreadWsEventType;
  threadId: string;
  data: unknown;
}
