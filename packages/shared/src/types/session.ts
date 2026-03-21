// @jait/shared — Session types
export interface SessionInfo {
  id: string;
  workspaceId: string | null;
  name: string | null;
  workspacePath: string | null;
  status: "active" | "archived" | "deleted";
  createdAt: string;
  lastActiveAt: string;
  metadata: string | null; // JSON string
}

export interface SessionCreateParams {
  workspaceId?: string;
  name?: string;
  workspacePath?: string;
}
