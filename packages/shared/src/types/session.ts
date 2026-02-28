// @jait/shared — Session types
export interface SessionInfo {
  id: string;
  name: string;
  workspaceId: string;
  deviceId: string;
  status: "active" | "idle" | "closed";
  createdAt: string;
  lastActivityAt: string;
}

export interface SessionCreateParams {
  name: string;
  workspaceId: string;
  deviceId: string;
}
