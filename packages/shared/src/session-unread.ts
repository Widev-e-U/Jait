import { readChatLoop } from "./chat-loop.js";

/** Activity is unread once it has not been viewed and its loop has stopped. */
export function isSessionUnread(session: {
  lastActiveAt?: string | null;
  viewedAt?: string | null;
  createdAt?: string | null;
  metadata?: unknown;
}): boolean {
  const lastActive = Date.parse(session.lastActiveAt ?? "");
  if (!Number.isFinite(lastActive)) return false;
  const unread = session.viewedAt
    ? lastActive > Date.parse(session.viewedAt)
    : !session.createdAt || lastActive > Date.parse(session.createdAt);
  return unread && readChatLoop(session.metadata)?.status !== "running";
}
