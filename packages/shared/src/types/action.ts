// @jait/shared — Action types
export type ActionStatus =
  | "awaiting_consent"
  | "executing"
  | "completed"
  | "failed"
  | "reverted";

export interface ActionResponse {
  action_id: string;
  status: ActionStatus;
  surface: string;
  device_id?: string;
  preview?: {
    command?: string;
    description: string;
    side_effects: string[];
  };
  consent_url?: string;
  expires_at?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  sessionId: string;
  workspaceId: string;
  surfaceType: string;
  deviceId: string;
  actionId: string;
  actionType: string;
  toolName: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  sideEffects: Record<string, unknown>;
  status: ActionStatus;
  consentMethod: "auto" | "confirm" | "2fa" | "passkey";
  signature?: string;
  parentActionId?: string;
}
