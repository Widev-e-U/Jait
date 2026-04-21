import type { ThreadActivity, ThreadService } from "./threads.js";

const MAX_REPLAY_MESSAGES = 24;
const MAX_REPLAY_CHARS = 12_000;

function sortActivitiesAsc(activities: ThreadActivity[]): ThreadActivity[] {
  return [...activities].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function normalizeMessageActivity(activity: ThreadActivity): { role: "user" | "assistant"; content: string } | null {
  if (activity.kind !== "message" || !activity.payload || typeof activity.payload !== "object") return null;
  const payload = activity.payload as Record<string, unknown>;
  const role = payload.role;
  if (role !== "user" && role !== "assistant") return null;
  const content = typeof payload.fullContent === "string"
    ? payload.fullContent
    : typeof payload.content === "string"
      ? payload.content
      : null;
  if (!content || !content.trim()) return null;
  return { role, content: content.trim() };
}

export function buildThreadHistoryReplayPrompt(
  threadService: ThreadService,
  threadId: string,
): string | null {
  const activities = sortActivitiesAsc(threadService.getActivities(threadId, 2000));
  const messages = activities
    .map(normalizeMessageActivity)
    .filter((message): message is NonNullable<typeof message> => Boolean(message));

  if (messages.length === 0) return null;

  const tail = messages.slice(-MAX_REPLAY_MESSAGES);
  const lines: string[] = [];
  let usedChars = 0;

  for (let i = tail.length - 1; i >= 0; i--) {
    const message = tail[i]!;
    const line = `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`;
    if (usedChars + line.length > MAX_REPLAY_CHARS) break;
    lines.unshift(line);
    usedChars += line.length;
  }

  if (lines.length === 0) return null;

  const truncated = lines.length < messages.length;
  return [
    "<thread-history>",
    "This thread is resuming in a fresh provider session.",
    "Use the prior conversation below as the thread history and continue from it.",
    truncated ? "Only the most recent portion is included here." : "The previous conversation is included below.",
    "",
    lines.join("\n\n"),
    "</thread-history>",
  ].join("\n");
}
