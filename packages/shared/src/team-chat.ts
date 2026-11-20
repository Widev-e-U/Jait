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
  /** Explicit membership for user-created chats; omitted on legacy hierarchy rooms. */
  memberIds?: string[];
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
  /** Persisted gateway event; clients cannot mint these through team.chat. */
  coordinationEvent?: { kind: "completion" | "recovery"; deliveryId: string };
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
  status: "queued" | "running" | "completed" | "delivered" | "failed" | "blocked" | "interrupted" | "cancelled";
  error: string | null;
}
const TEAM_DELIVERY_RANK = { sent: 1, received: 2, read: 3 } as const;
/**
 * Delivery state of a user's team message, using the shared indicator scale:
 * queued = sent, running/delivered = received by the agent, completed = read
 * (the agent has processed it). Any failed recipient fails the whole message;
 * otherwise the slowest recipient decides.
 */
export function teamMessageDeliveryState(
  deliveries: ReadonlyArray<Pick<TeamDelivery, "status">>,
): "sent" | "received" | "read" | "failed" {
  if (deliveries.length === 0) return "sent";
  let lowest: keyof typeof TEAM_DELIVERY_RANK = "read";
  for (const { status } of deliveries) {
    if (status === "failed" || status === "blocked" || status === "interrupted" || status === "cancelled") return "failed";
    const state = status === "completed" ? "read" : status === "queued" ? "sent" : "received";
    if (TEAM_DELIVERY_RANK[state] < TEAM_DELIVERY_RANK[lowest]) lowest = state;
  }
  return lowest;
}
export interface TeamWorkContext {
  roomId: string;
  agentId: string;
  deliveryId: string;
  messageId: string;
}
