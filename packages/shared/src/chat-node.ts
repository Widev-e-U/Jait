/** Personal chats choose their execution node; project chats inherit location. */
export function getPersonalChatNodeId(session: {
  projectId?: string | null;
  metadata?: string | null;
} | null | undefined): string | undefined {
  if (!session || session.projectId) return undefined;
  try {
    const metadata = JSON.parse(session.metadata ?? "{}");
    const nodeId = metadata?.chat?.nodeId;
    return typeof nodeId === "string" && nodeId.trim() ? nodeId.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function resolveChatNodeId(
  session: { projectId?: string | null; metadata?: string | null } | null | undefined,
  projectNodeId?: string | null,
): string {
  return session?.projectId
    ? projectNodeId?.trim() || "gateway"
    : getPersonalChatNodeId(session) ?? "gateway";
}
