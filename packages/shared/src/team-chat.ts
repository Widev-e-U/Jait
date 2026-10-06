export type TeamMessageKind = "discussion" | "assignment" | "question" | "review" | "result" | "verification" | "blocked" | "relay";
export interface TeamSender {
  kind: "user" | "agent" | "chat" | "system";
  id: string;
  name: string;
  avatar: string | null;
  sourceSessionId?: string;
}
export interface TeamGoal {
  description: string;
  criteria: string[];
  status: "active" | "completed" | "blocked";
  evidence?: string[];
  verificationAfterId?: string;
}
export interface TeamRoom {
  id: string;
  rootAgentId: string;
  name: string;
  projectId: string | null;
  projectPath: string | null;
  goal: TeamGoal | null;
}
export interface TeamRoomMessage {
  id: string;
  roomId: string;
  sender: TeamSender;
  content: string;
  attachments?: Array<{ name: string; mimeType: string; data: string }>;
  kind: TeamMessageKind;
  recipientIds: string[];
  createdAt: string;
  workSessionId?: string;
  parentMessageId?: string;
  depth: number;
  targetSessionId?: string;
}
export interface TeamDelivery {
  id: string;
  roomId: string;
  messageId: string;
  agentId: string;
  sessionId: string;
  status: "queued" | "running" | "completed" | "delivered" | "failed" | "interrupted";
  error: string | null;
}
export interface TeamWorkContext {
  roomId: string;
  agentId: string;
  deliveryId: string;
  messageId: string;
}
