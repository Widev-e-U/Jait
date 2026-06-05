/**
 * WhatsApp channel connector (baileys / WhatsApp Web).
 *
 * Connects using the multi-file auth state (QR link on first run, then
 * persisted credentials). Emits a QR data-URL for the UI, surfaces inbound
 * text messages, and sends replies.
 *
 * baileys + qrcode are lazy-imported by the default factories so unit tests can
 * inject fakes without importing the native-ish deps.
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { rm } from "node:fs/promises";
import type {
  ChannelConnector,
  ChannelConnectorEvents,
  ChannelStatus,
  InboundMessage,
  OutboundMessage,
} from "../types.js";

/* ── Minimal socket shape we depend on (subset of baileys' WASocket) ── */

export interface WAMessageKey {
  remoteJid?: string | null;
  fromMe?: boolean | null;
  participant?: string | null;
  id?: string | null;
}
export interface WAMessage {
  key: WAMessageKey;
  pushName?: string | null;
  message?: Record<string, unknown> | null;
  messageTimestamp?: number | Long | null;
}
interface Long { toNumber(): number; low: number; }

export interface WASocketLike {
  ev: { on(event: string, listener: (arg: unknown) => void): void };
  sendMessage(jid: string, content: { text: string }): Promise<unknown>;
  user?: { id?: string; lid?: string } | null;
  end?(error?: Error): void;
  ws?: { close(): void };
  logout?(): Promise<void>;
}

export interface AuthStateHandle {
  state: unknown;
  saveCreds: () => Promise<void>;
}

export interface WhatsAppConnectorDeps {
  /** Directory for persisted credentials. Default ~/.jait/channels/whatsapp. */
  authDir?: string;
  /** baileys socket factory. Default: dynamic import of baileys makeWASocket. */
  makeSocket?: (opts: { auth: unknown; printQRInTerminal: boolean; browser: unknown }) => WASocketLike;
  /** Auth-state loader. Default: baileys useMultiFileAuthState. */
  loadAuthState?: (dir: string) => Promise<AuthStateHandle>;
  /** QR encoder → data-URL. Default: qrcode.toDataURL. */
  encodeQr?: (text: string) => Promise<string>;
  /** Status code that means "logged out" (no auto-reconnect). Default 401. */
  loggedOutStatusCode?: number;
  log?: (msg: string, ...args: unknown[]) => void;
}

/** Extract plain text from a baileys message, if any. */
export function extractText(message: Record<string, unknown> | null | undefined): string {
  if (!message) return "";
  const m = message as {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
    ephemeralMessage?: { message?: Record<string, unknown> };
    viewOnceMessage?: { message?: Record<string, unknown> };
  };
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  // Unwrap ephemeral / view-once wrappers.
  if (m.ephemeralMessage?.message) return extractText(m.ephemeralMessage.message);
  if (m.viewOnceMessage?.message) return extractText(m.viewOnceMessage.message);
  return "";
}

/** Bare number portion of a JID, e.g. "49170...:5@s.whatsapp.net" → "49170...". */
export function bareJid(jid: string | null | undefined): string {
  if (!jid) return "";
  return jid.split("@")[0]!.split(":")[0]!;
}

function tsToMillis(ts: WAMessage["messageTimestamp"]): number {
  if (ts == null) return Date.now();
  if (typeof ts === "number") return ts * 1000;
  if (typeof ts === "object" && typeof (ts as Long).toNumber === "function") {
    return (ts as Long).toNumber() * 1000;
  }
  return Date.now();
}

export class WhatsAppConnector implements ChannelConnector {
  readonly id = "whatsapp";
  readonly label = "WhatsApp";

  private readonly authDir: string;
  private readonly deps: WhatsAppConnectorDeps;
  private sock: WASocketLike | null = null;
  private _status: ChannelStatus = "stopped";
  private _qr: string | null = null;
  /** Bare ids that identify this account (phone-number JID and LID alias). */
  private selfBares = new Set<string>();
  private events: ChannelConnectorEvents | null = null;
  private stopping = false;

  constructor(deps: WhatsAppConnectorDeps = {}) {
    this.deps = deps;
    this.authDir = deps.authDir ?? join(homedir(), ".jait", "channels", "whatsapp");
  }

  status(): ChannelStatus { return this._status; }
  currentQr(): string | null { return this._qr; }

  private log(msg: string, ...args: unknown[]) {
    (this.deps.log ?? ((m, ...a) => console.log("[whatsapp]", m, ...a)))(msg, ...args);
  }

  private setStatus(status: ChannelStatus, detail?: { qr?: string; error?: string }) {
    this._status = status;
    if (status === "qr") this._qr = detail?.qr ?? this._qr;
    if (status === "connected" || status === "stopped") this._qr = null;
    this.events?.onStatus(status, detail);
  }

  async start(events: ChannelConnectorEvents): Promise<void> {
    this.events = events;
    this.stopping = false;
    await this.connect();
  }

  private async loadAuth(): Promise<AuthStateHandle> {
    if (this.deps.loadAuthState) return this.deps.loadAuthState(this.authDir);
    const baileys = await import("baileys");
    return baileys.useMultiFileAuthState(this.authDir) as unknown as Promise<AuthStateHandle>;
  }

  private async buildSocket(auth: unknown): Promise<WASocketLike> {
    if (this.deps.makeSocket) {
      return this.deps.makeSocket({ auth, printQRInTerminal: false, browser: ["Jait", "Chrome", "1.0.0"] });
    }
    const baileys = await import("baileys");
    const makeWASocket = (baileys.default ?? (baileys as { makeWASocket?: unknown }).makeWASocket) as unknown as (
      opts: Record<string, unknown>,
    ) => WASocketLike;
    const browser = (baileys.Browsers?.appropriate?.("Jait")) ?? ["Jait", "Chrome", "1.0.0"];
    return makeWASocket({ auth, printQRInTerminal: false, browser, syncFullHistory: false });
  }

  private async encodeQr(text: string): Promise<string> {
    if (this.deps.encodeQr) return this.deps.encodeQr(text);
    const qrcode = await import("qrcode");
    return qrcode.toDataURL(text, { margin: 2, width: 512 });
  }

  private async connect(): Promise<void> {
    this.setStatus("connecting");
    const { state, saveCreds } = await this.loadAuth();
    const sock = await this.buildSocket(state);
    this.sock = sock;

    sock.ev.on("creds.update", () => { void saveCreds(); });

    sock.ev.on("connection.update", (arg: unknown) => {
      const u = arg as {
        connection?: string;
        qr?: string;
        lastDisconnect?: { error?: { output?: { statusCode?: number } } };
      };

      if (u.qr) {
        void this.encodeQr(u.qr)
          .then((dataUrl) => { this.setStatus("qr", { qr: dataUrl }); })
          .catch((err) => { this.log("QR encode failed:", err); });
      }

      if (u.connection === "open") {
        this.selfBares = new Set(
          [sock.user?.id, sock.user?.lid].map(bareJid).filter(Boolean),
        );
        this.setStatus("connected");
        this.log(`connected as ${[...this.selfBares].join(", ") || "?"}`);
      } else if (u.connection === "close") {
        const code = u.lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === (this.deps.loggedOutStatusCode ?? 401);
        if (this.stopping) {
          this.setStatus("stopped");
        } else if (loggedOut) {
          this.log("logged out — clearing credentials");
          void rm(this.authDir, { recursive: true, force: true }).catch(() => {});
          this.setStatus("error", { error: "Logged out. Re-link to reconnect." });
        } else {
          this.log(`connection closed (code ${code ?? "?"}) — reconnecting`);
          void this.connect().catch((err) => {
            this.setStatus("error", { error: err instanceof Error ? err.message : String(err) });
          });
        }
      }
    });

    sock.ev.on("messages.upsert", (arg: unknown) => {
      const payload = arg as { messages?: WAMessage[]; type?: string };
      if (payload.type && payload.type !== "notify") return;
      for (const m of payload.messages ?? []) {
        const inbound = this.toInbound(m);
        if (inbound) this.events?.onInbound(inbound);
      }
    });
  }

  /** Convert a baileys message to an InboundMessage, or null if not text. */
  toInbound(m: WAMessage): InboundMessage | null {
    const text = extractText(m.message);
    if (!text.trim()) return null;
    const conversationId = m.key.remoteJid ?? "";
    if (!conversationId || conversationId === "status@broadcast") return null;
    const senderId = m.key.participant ?? conversationId;
    const isSelfChat = this.selfBares.has(bareJid(conversationId));
    return {
      channelId: this.id,
      conversationId,
      senderId,
      senderName: m.pushName ?? undefined,
      text,
      timestamp: tsToMillis(m.messageTimestamp),
      fromMe: Boolean(m.key.fromMe),
      isSelfChat,
    };
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.sock) throw new Error("WhatsApp is not connected");
    await this.sock.sendMessage(msg.conversationId, { text: msg.text });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    try {
      this.sock?.end?.(undefined);
      this.sock?.ws?.close();
    } catch { /* best effort */ }
    this.sock = null;
    this.setStatus("stopped");
  }
}
