import { z } from "zod";

const roomId = z.string().min(3).max(512).startsWith("!");
const limit = z.number().int().min(1).max(50).default(20);
export const messengerCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }).strict(),
  z.object({ action: z.literal("rooms"), query: z.string().max(200).default(""), service: z.string().max(100).optional(), limit }).strict(),
  z.object({ action: z.literal("messages"), roomId, limit, earlier: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal("search"), query: z.string().trim().min(1).max(200), roomId: roomId.optional(), limit }).strict(),
  z.object({ action: z.literal("send"), roomId, text: z.string().min(1).max(10_000).refine(text => !!text.trim()) }).strict(),
  z.object({ action: z.literal("open"), userId: z.string().max(512).regex(/^@[^:\s]+:[^\s]+$/) }).strict(),
]);
export type MessengerCommand = z.infer<typeof messengerCommandSchema>;
export interface MessengerRequest {
  requestId: string;
  expiresAt: number;
  command: MessengerCommand;
}
export interface MessengerToolResponse {
  ok: boolean;
  message: string;
  data?: unknown;
}

/** Connection setup links never contain credentials. They do not sign in. */
export function messengerConnectionLink(homeserver: string, username?: string): string {
  const url = new URL(homeserver);
  if (url.username || url.password || url.search || url.hash
      || !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("Use HTTPS for Matrix, or HTTP on loopback. Do not include credentials or URL parameters.");
  }
  const params = new URLSearchParams({ homeserver: url.toString().replace(/\/$/, "") });
  if (username) params.set("username", username);
  return "/messenger?" + params;
}

export interface MessengerSession {
  homeserver: string
  userId: string
  deviceId: string
  accessToken: string
  cryptoStore: string
}

export interface MessengerReadReceipt {
  userId: string
  name: string
  timestamp: number | null
  /** False means this is a later read watermark, not the exact first-read time. */
  exact: boolean
}

/**
 * Matrix presence of a single user. `unknown` means the homeserver exposes no
 * presence for that user, which is the normal case for bridged contacts.
 */
export type MessengerPresence = 'online' | 'unavailable' | 'offline' | 'unknown'

/** The single other participant of a direct Matrix conversation. */
export interface MessengerRoomPeer {
  userId: string
  name: string
  /** Matrix `mxc://` avatar, resolved through the gateway media route. */
  avatarUrl?: string
  presence: MessengerPresence
  /** Milliseconds since the peer was last active, when the homeserver reports it. */
  lastActiveAgo?: number
}

export interface MessengerMessage {
  id: string
  sender: string
  /** Stable Matrix user ID, when available, for distinguishing contacts with the same name. */
  senderId?: string
  body: string
  timestamp: number
  own: boolean
  encrypted: boolean
  unableToDecrypt: boolean
  pending: boolean
  failed: boolean
  edited?: boolean
  reactions?: { key: string; count: number; own: boolean; senders: string[] }[]
  readBy?: MessengerReadReceipt[]
  attachment?: {
    url: string
    name: string
    mime: string
    image: boolean
    size?: number
    file?: Record<string, unknown>
  }
}

/** Detect the pseudo-room used by the WhatsApp bridge for status updates. */
export function isStatusRoom(room: { name?: string | null; topic?: string | null }): boolean {
  return /status broadcast/i.test(String(room.name ?? '')) || /status updates from your contacts/i.test(String(room.topic ?? ''))
}

/** Beyond plain chats: WhatsApp stories, and team-platform hubs (spaces) with their channels. */
export type MessengerRoomKind = 'chat' | 'status' | 'team' | 'channel'

export interface MessengerRoom {
  id: string
  name: string
  service: string
  network: string
  unread: number
  markedUnread?: boolean
  membership: string
  encrypted: boolean
  timestamp: number
  preview: string
  /** WhatsApp status broadcasts have no real timeline; they get a dedicated read-only view. */
  status?: boolean
  /** Structural shape of the room. Absent means a plain chat. */
  kind?: MessengerRoomKind
  /** Team/workspace this room belongs to (Slack workspace, Teams team, Discord guild). */
  team?: string
  /** Room topic, surfaced on channel headers. */
  topic?: string
  /** Room avatar, or the counterpart's avatar for direct chats (`mxc://`). */
  avatarUrl?: string
  /** Set for direct conversations with exactly one other participant. */
  peer?: MessengerRoomPeer
}

export interface MessengerSnapshot {
  status: 'disconnected' | 'connecting' | 'syncing' | 'ready' | 'reconnecting' | 'error'
  error: string | null
  session: Pick<MessengerSession, 'homeserver' | 'userId' | 'deviceId'> | null
  rooms: MessengerRoom[]
  selectedRoomId: string | null
  messages: MessengerMessage[]
  hasEarlier?: boolean
  historyLimited?: boolean
  notifications: boolean
  assistantAccess: boolean
}
