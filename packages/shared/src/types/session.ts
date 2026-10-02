// @jait/shared — Session types
export interface SessionInfo {
  id: string;
  projectId: string | null;
  name: string | null;
  projectPath: string | null;
  status: "active" | "archived" | "deleted";
  createdAt: string;
  lastActiveAt: string;
  viewedAt: string | null;
  metadata: string | null; // JSON string
}

export interface SessionCreateParams {
  projectId?: string;
  name?: string;
  projectPath?: string;
}

/** Lightweight activity snapshot; startedAt comes from durable turn state. */
export interface AgentRuntime {
  running: boolean;
  startedAt: string | null;
}
