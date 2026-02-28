// @jait/shared — Action types
export type ActionStatus =
  | "pending"
  | "approved"
  | "executing"
  | "executed"
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
  sessionId?: string | null;
  surfaceType?: string | null;
  deviceId?: string | null;
  actionId: string;
  actionType: string;
  toolName?: string | null;
  inputs?: string | null;   // JSON string
  outputs?: string | null;  // JSON string
  sideEffects?: string | null; // JSON string
  status: string;
  consentMethod?: string | null;
  signature?: string | null;
  parentActionId?: string | null;
}
