import { JAIT_PAGES, JAIT_PAGE_IDS } from "./capability-catalog.js";

/** Transport-independent notification metadata. IDs identify events; replaceId identifies a card. */
export interface NotificationContext {
  link?: string;
  replaceId?: string;
  kind?: "completion" | "attention";
  sessionId?: string;
  /**
   * Agent that produced the turn. Flat strings only: the FCM data payload is a
   * `Record<string, string>`, so nested identity objects cannot be delivered.
   * These fields let in-app surfaces (toast, badge, list row) draw the agent
   * avatar; text transports use `notificationTitleWithAgent` /
   * `notificationBodyWithAgent` instead.
   */
  agentId?: string;
  agentName?: string;
  agentRole?: string;
  agentAvatar?: string;
}

/**
 * Who produced a notification.
 *
 * Platform limits that shape this contract: OS push (FCM/APNs data payloads)
 * and the browser Notification API carry text plus an app-level icon, and a
 * per-notification image is unsupported on Android Chrome and most push
 * payloads. An agent avatar therefore never travels reliably as an image, so
 * identity is carried in the text and `avatar` stays an in-app enrichment.
 */
export interface NotificationAgentIdentity {
  id?: string | null;
  name?: string | null;
  role?: string | null;
  avatar?: string | null;
}

/** Lock screens truncate aggressively; keep one bounded label line. */
const NOTIFICATION_AGENT_LABEL_LIMIT = 64;

function notificationAgentLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length > NOTIFICATION_AGENT_LABEL_LIMIT
    ? `${cleaned.slice(0, NOTIFICATION_AGENT_LABEL_LIMIT - 1)}…`
    : cleaned;
}

/**
 * Identifiers are sanitized but never clamped: a truncated id is a wrong id,
 * and in-app surfaces may resolve it against the profile list.
 */
function notificationAgentIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, "").trim();
  return cleaned || null;
}

/** Flat, sanitized agent fields safe to spread into a notification payload. */
export function notificationAgentContext(agent?: NotificationAgentIdentity | null): Pick<NotificationContext, "agentId" | "agentName" | "agentRole" | "agentAvatar"> {
  const name = notificationAgentLabel(agent?.name);
  const role = notificationAgentLabel(agent?.role);
  const avatar = notificationAgentLabel(agent?.avatar);
  const id = notificationAgentIdentifier(agent?.id);
  return {
    ...(id ? { agentId: id } : {}),
    ...(name ? { agentName: name } : {}),
    ...(role ? { agentRole: role } : {}),
    ...(avatar ? { agentAvatar: avatar } : {}),
  };
}

/**
 * Name the agent in the title. Without a usable agent name the title is
 * returned byte-identical to the pre-agent behavior, so chats without a bound
 * persona keep their existing notification text.
 */
export function notificationTitleWithAgent(title: string, agent?: NotificationAgentIdentity | null): string {
  const name = notificationAgentLabel(agent?.name);
  if (!name) return title;
  return title ? `${name} · ${title}` : name;
}

/**
 * Lead the body with the agent role (falling back to the name) so a lock
 * screen shows which kind of agent finished. Without identity the body is
 * returned unchanged.
 */
export function notificationBodyWithAgent(body: string, agent?: NotificationAgentIdentity | null): string {
  const lead = notificationAgentLabel(agent?.role) ?? notificationAgentLabel(agent?.name);
  if (!lead) return body;
  return body ? `${lead} · ${body}` : lead;
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
    const paths: readonly string[] = JAIT_PAGE_IDS.map((id) => JAIT_PAGES[id].path);
    if (!paths.includes(url.pathname) && !["/chat", "/email", "/pull-requests"].includes(url.pathname)) return null;
    return url.pathname + url.search;
  } catch { return null; }
}

export function notificationPreview(value: string): string {
  return value.replace(/```[\s\S]*?```/g, " [code] ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "").replace(/[#*_`~]/g, "")
    .replace(/\s+/g, " ").trim().slice(0, 200);
}
