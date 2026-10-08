export type TeamMessageKind = "discussion" | "assignment" | "question" | "review" | "result" | "verification" | "blocked" | "relay";
export interface TeamSender {
  kind: "user" | "agent" | "chat" | "system";
  id: string;
  name: string;
  avatar: string | null;
  sourceSessionId?: string;
  sourceThreadId?: string;
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
export interface TeamRoutingDecision {
  source: "system-one" | "fallback";
  recipientId: string;
  model?: string;
  confidence?: number;
  reason: string;
  candidates: Array<{ id: string; name: string; role: string | null; persona: string; score: number }>;
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
  workThreadId?: string;
  parentMessageId?: string;
  routingDecision?: TeamRoutingDecision;
  depth: number;
  targetSessionId?: string;
}
export interface TeamDelivery {
  id: string;
  roomId: string;
  messageId: string;
  agentId: string;
  /** Legacy work chat ID, or the thread ID for thread-backed deliveries. */
  sessionId: string;
  threadId?: string;
  threadStatus?: string;
  status: "queued" | "running" | "completed" | "delivered" | "failed" | "interrupted";
  error: string | null;
}
export interface TeamWorkContext {
  roomId: string;
  agentId: string;
  deliveryId: string;
  messageId: string;
}
