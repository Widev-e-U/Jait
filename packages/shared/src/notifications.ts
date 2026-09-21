/** Transport-independent notification metadata. IDs identify events; replaceId identifies a card. */
export interface NotificationContext {
  link?: string;
  replaceId?: string;
  kind?: "completion" | "attention";
  sessionId?: string;
}

export interface NotificationActivation {
  id: string;
  link: string;
  scope?: string;
}

export function chatNotificationLink(sessionId: string, projectId?: string | null): string {
  const params = new URLSearchParams({ sessionId });
  if (projectId) params.set("projectId", projectId);
  return `/chat?${params}`;
}

/** Never allow OS activation to navigate to an arbitrary host, protocol, or command. */
export function safeNotificationLink(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return null;
  try {
    const url = new URL(value, "https://jait.invalid");
    if (url.origin !== "https://jait.invalid") return null;
    if (!/^\/(?:chat|pulls|pull-requests|todo|email|emails|calendar|memory|jobs|network|settings)?$/.test(url.pathname)) return null;
    return url.pathname + url.search;
  } catch { return null; }
}

export function notificationPreview(value: string): string {
  return value.replace(/```[\s\S]*?```/g, " [code] ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "").replace(/[#*_`~]/g, "")
    .replace(/\s+/g, " ").trim().slice(0, 200);
}
