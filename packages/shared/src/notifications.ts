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

/**
 * Surfaces a Jait client can notify through.
 *
 * Every row is derived from this repository's own call sites rather than from
 * vendor documentation. Where the emitted payload has no image field, the OS
 * cannot invent one, so `agentIcon` is false by construction; anything not
 * observed on a real device is called out as unverified in `note` instead of
 * being asserted.
 */
export type NotificationPlatformId =
  | "in-app-toast"
  | "browser-notification-api"
  | "desktop-shell-linux"
  | "desktop-shell-macos"
  | "desktop-shell-windows"
  | "android-agent-overlay"
  | "capacitor-local-notifications"
  | "fcm-push";

export interface NotificationPlatformCapability {
  id: NotificationPlatformId;
  /** Human label for the in-repo support matrix. */
  label: string;
  /** Transport this repo actually uses, naming the call site that proves it. */
  transport: string;
  /** Text always travels; no surface in the matrix is image-only. */
  text: true;
  /** Whether this repo hands the surface a static app-level icon. */
  appIcon: "sent" | "not-sent";
  /** Whether the surface can render the *originating agent's* icon. */
  agentIcon: boolean;
  /** What was verified here, and what stays unverified. */
  note: string;
  /** How identity is still shown when `agentIcon` is false. */
  fallback: string;
}

const IDENTITY_TOAST_FALLBACK = "In-app identity toast: the agent's avatar and name are drawn by the app itself.";

export const NOTIFICATION_PLATFORM_MATRIX: readonly NotificationPlatformCapability[] = [
  {
    id: "in-app-toast",
    label: "In-app toast (every platform)",
    transport: "sonner toast rendered by apps/web/src/lib/system-notifications.ts emitToast",
    text: true,
    appIcon: "not-sent",
    agentIcon: true,
    note: "DOM surface owned by this app, so it renders the same AgentAvatar SVG the rest of the UI uses. This is the only surface verified to draw a per-agent icon.",
    fallback: "This surface is the fallback; it needs no further degradation.",
  },
  {
    id: "browser-notification-api",
    label: "Browser Notification API (desktop Chromium, macOS Safari)",
    transport: "new Notification(title, options) with icon: /apple-touch-icon.png (apps/web/src/lib/system-notifications.ts)",
    text: true,
    appIcon: "sent",
    agentIcon: false,
    note: "The repo passes one fixed app icon (NOTIFICATION_ICON = '/apple-touch-icon.png'), the same for every notification, and the payload it builds carries no per-agent image URL at all. Whether a given browser/OS actually paints that option is not verified here.",
    fallback: IDENTITY_TOAST_FALLBACK,
  },
  {
    id: "desktop-shell-linux",
    label: "Desktop app shell, Linux",
    transport: "notify-send <title> <body> (apps/desktop/src-tauri/src/shell.rs)",
    text: true,
    appIcon: "not-sent",
    agentIcon: false,
    note: "The command is spawned with exactly two arguments, so no -i/--icon argument ever reaches the notification daemon.",
    fallback: IDENTITY_TOAST_FALLBACK,
  },
  {
    id: "desktop-shell-macos",
    label: "Desktop app shell, macOS",
    transport: "osascript -e 'display notification \"<body>\" with title \"<title>\"' (apps/desktop/src-tauri/src/shell.rs)",
    text: true,
    appIcon: "not-sent",
    agentIcon: false,
    note: "The AppleScript expression passed here carries title and body only; this call shape has no image parameter.",
    fallback: IDENTITY_TOAST_FALLBACK,
  },
  {
    id: "desktop-shell-windows",
    label: "Desktop app shell, Windows",
    transport: "ToastGeneric XML built in apps/desktop/src-tauri/src/notification.rs",
    text: true,
    appIcon: "not-sent",
    agentIcon: false,
    note: "The toast binding is exactly two <text> elements plus one protocol <action>; no <image> element is emitted, so the shell cannot show a per-agent picture.",
    fallback: IDENTITY_TOAST_FALLBACK,
  },
  {
    id: "android-agent-overlay",
    label: "Android AgentOverlay bridge",
    transport: "Capacitor AgentOverlay.notify({ id, title, body })",
    text: true,
    appIcon: "not-sent",
    agentIcon: false,
    note: "The bridge signature accepts id/title/body only; an image would need a new native method before this row could change.",
    fallback: IDENTITY_TOAST_FALLBACK,
  },
  {
    id: "capacitor-local-notifications",
    label: "Capacitor LocalNotifications (WebView / Windows / Android shell plugins)",
    transport: "LocalNotifications.schedule({ notifications: [{ id, title, body, schedule }] })",
    text: true,
    appIcon: "not-sent",
    agentIcon: false,
    note: "The schedule payload this repo builds carries only a numeric id, title, body and an immediate schedule. This repo declares its own minimal LocalNotifications option type for that call and passes no image field, so no per-agent picture is sent from here.",
    fallback: IDENTITY_TOAST_FALLBACK,
  },
  {
    id: "fcm-push",
    label: "FCM push (Android device, no live client)",
    transport: "FCM data payload typed Record<string, string> (packages/gateway/src/services/mobile-push.ts)",
    text: true,
    appIcon: "not-sent",
    agentIcon: false,
    note: "A string map can carry agentId/agentName/agentRole/agentAvatar as text but no image, so the device shows the app icon. Those fields are what the in-app surfaces then read.",
    fallback: IDENTITY_TOAST_FALLBACK,
  },
] as const;

const NOTIFICATION_PLATFORM_BY_ID = new Map<string, NotificationPlatformCapability>(
  NOTIFICATION_PLATFORM_MATRIX.map((platform) => [platform.id, platform]),
);

/** The matrix row for a surface, or null when the surface is unknown to this build. */
export function notificationPlatformCapability(platformId: string): NotificationPlatformCapability | null {
  return NOTIFICATION_PLATFORM_BY_ID.get(platformId) ?? null;
}

/**
 * Unknown surfaces answer false: a surface this build cannot prove support for
 * must not be assumed to draw the agent, so identity keeps its in-app fallback.
 */
export function notificationPlatformSupportsAgentIcon(platformId: string): boolean {
  return notificationPlatformCapability(platformId)?.agentIcon === true;
}

/** True for every surface that needs the in-app identity fallback. */
export function notificationPlatformNeedsAgentIdentityFallback(platformId: string): boolean {
  return !notificationPlatformSupportsAgentIcon(platformId);
}

/**
 * Whether a payload actually names an agent. Sanitized the same way the text
 * helpers sanitize, so a whitespace-only or control-character label is not
 * treated as identity and the plain notification path stays in force.
 */
export function notificationContextHasAgentIdentity(ctx?: NotificationContext | null): boolean {
  return Boolean(notificationAgentLabel(ctx?.agentName) ?? notificationAgentLabel(ctx?.agentAvatar));
}
