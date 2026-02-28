// @jait/shared — Session types
export interface SessionInfo {
  id: string;
  name: string | null;
  workspacePath: string | null;
  status: "active" | "archived" | "deleted";
  createdAt: string;
  lastActiveAt: string;
  metadata: string | null; // JSON string
}

export interface SessionCreateParams {
  name?: string;
  workspacePath?: string;
}
