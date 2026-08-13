/**
 * Telegram channel connector.
 *
 * Linking works like WhatsApp's QR flow, adapted to what Telegram allows: the
 * bot itself must be created once in @BotFather (there is no API for that), but
 * everything after the token is scan-and-go. The connector resolves the bot
 * username, renders `https://t.me/<bot>?start=<code>` as a QR, and waits for the
 * `/start <code>` message Telegram sends when the user taps Start. That message
 * carries the user's numeric id, which is handed to the manager and persisted
 * as an allowed sender — so scanning the code is all it takes to link an account.
 */

import { randomBytes } from "node:crypto";
import type {
  ChannelCommandDescriptor,
  ChannelConfig,
  ChannelConnector,
  ChannelConnectorEvents,
  ChannelPairOptions,
  ChannelSetupGuide,
  ChannelStatus,
  InboundMessage,
  OutboundMessage,
} from "../types.js";

interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  date?: number;
  chat: { id: number | string; type?: string };
  from?: TelegramUser;
  text?: string;
}

/** A tapped inline-keyboard button. */
interface TelegramCallbackQuery {
  id: string;
  from?: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  /** Bot API error code — 401 a rejected token, 409 a second poller. */
  error_code?: number;
}

/** A Bot API call that answered `ok: false`, carrying Telegram's error code. */
class TelegramApiError extends Error {
  constructor(message: string, readonly errorCode?: number) {
    super(message);
    this.name = "TelegramApiError";
  }
}

export interface TelegramConnectorDeps {
  token?: string;
  baseUrl?: string;
  pollTimeoutSeconds?: number;
  fetchImpl?: typeof fetch;
  /** QR encoder → data-URL. Default: qrcode.toDataURL (lazy-imported). */
  encodeQr?: (text: string) => Promise<string>;
  /** Pairing code generator. Injectable so tests get a deterministic code. */
  makePairingCode?: () => string;
  /** How long a pairing code stays valid. Default 5 minutes. */
  pairingTtlMs?: number;
  /** Backoff floor after a failed poll. Default 1s. Injectable for tests. */
  pollRetryMinMs?: number;
  /** Backoff ceiling after a failed poll. Default 30s. */
  pollRetryMaxMs?: number;
  log?: (msg: string, ...args: unknown[]) => void;
}

/**
 * How long a pairing code stays scannable. Long enough to walk to a phone and
 * scan, short enough that a QR left on a screen (or in a screenshot) stops
 * being a way into the channel.
 */
const DEFAULT_PAIRING_TTL_MS = 5 * 60_000;

/** Telegram deep-link payloads allow A–Z a–z 0–9 _ - only, max 64 chars. */
function defaultPairingCode(): string {
  return randomBytes(12).toString("base64url");
}

export function telegramMessageToInbound(message: TelegramMessage): InboundMessage | null {
  const text = message.text?.trim();
  if (!text) return null;
  const conversationId = String(message.chat.id);
  const senderId = String(message.from?.id ?? message.chat.id);
  const senderName = message.from?.username
    ? `@${message.from.username}`
    : message.from?.first_name;
  return {
    channelId: "telegram",
    conversationId,
    senderId,
    senderName,
    text,
    timestamp: (message.date ?? Math.floor(Date.now() / 1000)) * 1000,
    fromMe: false,
    isSelfChat: false,
  };
}

/** Extract the deep-link payload from a `/start <payload>` command. */
export function parseStartPayload(text: string): string | null {
  const match = /^\/start(?:@\w+)?(?:\s+(\S+))?$/.exec(text.trim());
  if (!match) return null;
  return match[1] ?? "";
}

/** True when the channel already knows who to talk to. */
export function isPaired(config: ChannelConfig | undefined): boolean {
  if (!config) return false;
  return Boolean(config.respondToAll) || (config.allowedSenders ?? []).length > 0;
}

/**
 * Pull a bot token out of whatever the user pasted. BotFather hands the token
 * back inside a paragraph of prose, so accepting the whole message saves the
 * fiddly select-just-the-token step on a phone.
 */
export function extractBotToken(input: string): string | null {
  const match = /\b(\d{6,}:[A-Za-z0-9_-]{30,})\b/.exec(input);
  return match?.[1] ?? null;
}

/** Base32-ish alphabet: no vowels-only ambiguity, safe in a Telegram username. */
const USERNAME_SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** Slug length: 16 symbols from a 32-symbol alphabet ≈ 80 bits of entropy. */
const USERNAME_SLUG_LENGTH = 16;

/**
 * Random slug for a suggested bot username.
 *
 * Telegram usernames are first-come-first-served, so a weak suggestion loses
 * the race against squatters and collides with other installs. Sixteen symbols
 * keep `jait_<slug>_bot` at 25 characters — comfortably inside Telegram's
 * 32-character limit — while carrying real entropy.
 */
export function generateUsernameSlug(length = USERNAME_SLUG_LENGTH): string {
  const bytes = randomBytes(length);
  let slug = "";
  for (const byte of bytes) slug += USERNAME_SLUG_ALPHABET[byte % USERNAME_SLUG_ALPHABET.length];
  return slug;
}

/** Telegram usernames: 5–32 chars, letters/digits/underscore, must end in "bot". */
export function suggestBotUsername(seed = generateUsernameSlug()): string {
  return `jait_${seed}_bot`;
}

/**
 * Deep link that opens @BotFather with `/newbot` already in the input field, so
 * creating the bot is tap-Start-tap-Send instead of typing a command.
 */
export function botFatherSetupLink(): string {
  return `https://t.me/BotFather?text=${encodeURIComponent("/newbot")}`;
}

/** Telegram's own cap on a bot's command menu. */
export const TELEGRAM_MAX_COMMANDS = 100;

/** Telegram clears the typing indicator after ~5s; refresh inside that window. */
const TYPING_REFRESH_MS = 4_000;

/** Inline-keyboard button captions are truncated by clients past ~64 chars. */
const TELEGRAM_BUTTON_LABEL_MAX = 64;

/**
 * How many pending button choices to keep. Each dialog adds a handful; this is
 * generous for real use while keeping the map bounded on a connector that runs
 * for weeks.
 */
const MAX_REMEMBERED_CHOICES = 500;

/**
 * Telegram scopes a command menu; a chat resolves the narrowest match. Setting
 * all three means private chats, groups and anything falling through (forum
 * topics) all see the menu.
 */
const TELEGRAM_COMMAND_SCOPES = ["default", "all_private_chats", "all_group_chats"] as const;

/**
 * Coerce a command into what `setMyCommands` accepts: names are 1–32 chars of
 * lowercase letters, digits and underscores; descriptions 1–256 chars. Entries
 * that cannot be salvaged are dropped rather than failing the whole batch.
 */
export function toTelegramCommands(commands: ChannelCommandDescriptor[]): { command: string; description: string }[] {
  const seen = new Set<string>();
  const result: { command: string; description: string }[] = [];
  for (const entry of commands) {
    const command = entry.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32);
    const description = entry.description.trim().slice(0, 256);
    if (!command || !description || seen.has(command)) continue;
    seen.add(command);
    result.push({ command, description });
    if (result.length >= TELEGRAM_MAX_COMMANDS) break;
  }
  return result;
}

/**
 * Only http(s) URLs may be echoed into an outbound message — the value comes
 * from the browser, and `javascript:`/`tg:` links in a chat are a hand-off to
 * whatever the messenger does with them.
 */
export function sanitizeReturnUrl(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Default long-poll window handed to `getUpdates`. */
const DEFAULT_POLL_TIMEOUT_SECONDS = 25;

/** First retry after a failed poll — a blip should cost about a second. */
const POLL_RETRY_MIN_MS = 1_000;

/** Backoff ceiling. Telegram outages last minutes, so stop doubling here. */
const POLL_RETRY_MAX_MS = 30_000;

/**
 * Consecutive failures tolerated before the channel is reported as broken. One
 * dropped long poll is routine; three in a row is worth a badge in the UI.
 */
const POLL_FAILURES_BEFORE_ERROR = 3;

/**
 * Grace on top of the long-poll window before a stalled request is dropped. A
 * socket can die without erroring (laptop suspend, NAT timeout), and then the
 * request never settles — the channel looks connected while nothing arrives.
 */
const POLL_WATCHDOG_GRACE_MS = 15_000;

/** Bot API code for "another getUpdates is already running for this bot". */
const TELEGRAM_CONFLICT = 409;

/**
 * Telegram error codes that no amount of retrying will fix: the token is wrong,
 * revoked, or the bot is gone. Everything else — a 409 from a second poller, a
 * 5xx, a dropped socket — deserves another attempt.
 */
export function isFatalPollError(errorCode: number | undefined): boolean {
  return errorCode === 401 || errorCode === 404;
}

/** Exponential backoff with a ceiling: 1s, 2s, 4s … capped. */
export function pollBackoffMs(
  attempt: number,
  minMs = POLL_RETRY_MIN_MS,
  maxMs = POLL_RETRY_MAX_MS,
): number {
  return Math.min(maxMs, minMs * 2 ** Math.max(0, attempt - 1));
}

/**
 * Say what a poll failure actually means. Telegram's own wording for a 409
 * mentions "other getUpdates request", which reads as an internal detail — the
 * user needs to know two Jait instances share one bot token.
 */
export function describePollFailure(message: string, errorCode?: number): string {
  if (errorCode === TELEGRAM_CONFLICT) {
    return "Another instance is polling this bot — Telegram allows only one. Stop the other Jait gateway, or give this one its own bot token.";
  }
  if (isFatalPollError(errorCode)) {
    return `${message} — the bot token was rejected. Check it in @BotFather and paste it again.`;
  }
  return message;
}

/** Sleep that resolves early when the connector is stopped. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

export class TelegramConnector implements ChannelConnector {
  readonly id = "telegram";
  readonly label = "Telegram";
  /** Choices render as an inline keyboard. */
  readonly supportsChoices = true;

  private readonly deps: TelegramConnectorDeps;
  private readonly baseUrl: string;
  private _status: ChannelStatus = "stopped";
  private _qr: string | null = null;
  private _link: string | null = null;
  private events: ChannelConnectorEvents | null = null;
  private abort: AbortController | null = null;
  private offset = 0;
  private config: ChannelConfig = {};
  /** Active pairing code, or null when not waiting for a scan. */
  private pairingCode: string | null = null;
  /** Epoch ms after which `pairingCode` stops being accepted. */
  private pairingExpiresAt = 0;
  private botUsername: string | null = null;
  /** Where to send the user back to after a successful scan. */
  private returnUrl: string | undefined;
  /** Last reported poll failure, so one outage isn't announced repeatedly. */
  private lastPollError: string | null = null;
  /** callback_data token → the message to dispatch when the button is tapped. */
  private readonly choiceValues = new Map<string, string>();
  private choiceSeq = 0;

  constructor(deps: TelegramConnectorDeps = {}) {
    this.deps = deps;
    this.baseUrl = deps.baseUrl ?? "https://api.telegram.org";
  }

  status(): ChannelStatus { return this._status; }
  currentQr(): string | null { return this._qr; }
  currentLink(): string | null { return this._link; }
  /** When the shown pairing code stops working, or null outside pairing. */
  currentExpiry(): string | null {
    return this.pairingExpiresAt ? new Date(this.pairingExpiresAt).toISOString() : null;
  }

  private log(msg: string, ...args: unknown[]) {
    (this.deps.log ?? ((m, ...a) => console.log("[telegram]", m, ...a)))(msg, ...args);
  }

  /** Token precedence: injected → channel config → env. */
  private token(): string {
    // An explicitly injected token wins, including an empty one ("no token").
    if (this.deps.token !== undefined) return this.deps.token.trim();
    const configured = this.config.token?.trim();
    if (configured) return configured;
    return process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  }

  private setStatus(status: ChannelStatus, detail?: { qr?: string; link?: string; expiresAt?: string; error?: string }) {
    this._status = status;
    if (status === "qr") {
      this._qr = detail?.qr ?? this._qr;
      this._link = detail?.link ?? this._link;
    }
    if (status === "connected" || status === "stopped" || status === "error") {
      this._qr = null;
      this._link = null;
      this.pairingExpiresAt = 0;
    }
    this.events?.onStatus(status, detail);
  }

  /**
   * Everything needed to create the bot: a QR/deep link into @BotFather with
   * `/newbot` prefilled, plus name suggestions the user can paste as answers.
   * Telegram has no bot-creation API, so this is the shortest possible path.
   */
  async setupGuide(): Promise<ChannelSetupGuide> {
    const link = botFatherSetupLink();
    let qr: string | null = null;
    try {
      qr = await this.encodeQr(link);
    } catch (err) {
      // The link alone is still enough on a desktop — don't fail the guide.
      this.log("setup QR encode failed:", err);
    }
    return {
      link,
      qr,
      suggestedName: "Jait Assistant",
      suggestedUsername: suggestBotUsername(),
    };
  }

  async start(events: ChannelConnectorEvents, config?: ChannelConfig, options?: ChannelPairOptions): Promise<void> {
    this.events = events;
    this.config = config ?? {};
    this.returnUrl = sanitizeReturnUrl(options?.returnUrl);
    const token = this.token();
    if (!token) {
      this.setStatus("error", {
        error: "No bot token configured. Create a bot with @BotFather and paste its token.",
      });
      return;
    }

    this.abort?.abort();
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.lastPollError = null;
    this.setStatus("connecting");

    try {
      await this.connectAndPoll(signal);
    } catch (err) {
      if (signal.aborted) return;
      const code = err instanceof TelegramApiError ? err.errorCode : undefined;
      const detail = describePollFailure(err instanceof Error ? err.message : String(err), code);
      this.setStatus("error", { error: detail });
      // A rejected token needs a human. Anything else — Telegram unreachable
      // because the gateway booted before the network came up, say — resolves
      // itself, so keep trying instead of leaving a dead channel behind.
      if (!isFatalPollError(code)) void this.retryConnect(signal);
    }
  }

  /** Handshake, settle the pairing state, then poll. Throws if getMe fails. */
  private async connectAndPoll(signal: AbortSignal): Promise<void> {
    const me = await this.api<TelegramUser>("getMe", undefined, signal);
    if (!me.ok) throw new TelegramApiError(me.description ?? "Telegram getMe failed", me.error_code);
    this.botUsername = me.result?.username ?? null;
    this.log(`connected as ${this.botUsername ?? me.result?.id ?? "bot"}`);

    if (isPaired(this.config)) this.setStatus("connected");
    else await this.beginPairing();
    if (this._status === "error") return;

    // Polling starts only once the pairing state is settled — otherwise a
    // `/start` arriving mid-setup would be overwritten by the pending QR status.
    // It must run during pairing too: the handshake arrives as a normal update.
    void this.pollLoop();
  }

  /**
   * Retry the handshake with backoff after a transient failure, so a channel
   * switched on while Telegram was unreachable comes up by itself rather than
   * waiting for someone to notice the badge and toggle it.
   */
  private async retryConnect(signal: AbortSignal): Promise<void> {
    for (let attempt = 1; !signal.aborted; attempt += 1) {
      await delay(this.backoffFor(attempt), signal);
      if (signal.aborted) return;
      try {
        await this.connectAndPoll(signal);
        this.lastPollError = null;
        return;
      } catch (err) {
        if (signal.aborted) return;
        const code = err instanceof TelegramApiError ? err.errorCode : undefined;
        const detail = describePollFailure(err instanceof Error ? err.message : String(err), code);
        this.log(`connect attempt ${attempt} failed: ${detail}`);
        if (isFatalPollError(code)) {
          this.reportPollFailure(detail);
          return;
        }
      }
    }
  }

  async stop(): Promise<void> {
    this.abort?.abort();
    this.abort = null;
    this.pairingCode = null;
    this.pairingExpiresAt = 0;
    this.lastPollError = null;
    this.setStatus("stopped");
  }

  /**
   * Publish the command menu shown when a user types `/`. Registered for every
   * scope independently — Telegram resolves the narrowest matching one, and a
   * scope that fails (older API surface, restricted bot) must not cost us the
   * others. Never throws: the menu is a convenience, not part of the link.
   */
  async setCommandMenu(commands: ChannelCommandDescriptor[]): Promise<void> {
    if (!this.token()) return;
    const payload = toTelegramCommands(commands);
    if (payload.length === 0) return;

    for (const scope of TELEGRAM_COMMAND_SCOPES) {
      try {
        const res = await this.api("setMyCommands", { commands: payload, scope: { type: scope } });
        if (!res.ok) this.log(`setMyCommands failed for scope ${scope}: ${res.description ?? "unknown error"}`);
      } catch (err) {
        this.log(`setMyCommands failed for scope ${scope}:`, err);
      }
    }
    this.log(`command menu published (${payload.length} commands)`);
  }

  /** Re-enter pairing mode to link another account. */
  async pair(options?: ChannelPairOptions): Promise<void> {
    if (this._status !== "connected" && this._status !== "qr") {
      throw new Error("Connect the channel before pairing");
    }
    this.returnUrl = sanitizeReturnUrl(options?.returnUrl) ?? this.returnUrl;
    await this.beginPairing();
  }

  /** Mint a pairing code, render the deep link as a QR, and await the scan. */
  private async beginPairing(): Promise<void> {
    if (!this.botUsername) {
      this.setStatus("error", {
        error: "The bot has no username — set one in @BotFather, then reconnect.",
      });
      return;
    }
    const code = (this.deps.makePairingCode ?? defaultPairingCode)();
    this.pairingCode = code;
    this.pairingExpiresAt = Date.now() + (this.deps.pairingTtlMs ?? DEFAULT_PAIRING_TTL_MS);
    const expiresAt = new Date(this.pairingExpiresAt).toISOString();
    const link = `https://t.me/${this.botUsername}?start=${code}`;
    try {
      const qr = await this.encodeQr(link);
      this.setStatus("qr", { qr, link, expiresAt });
    } catch (err) {
      // Without a QR the link alone is still enough to pair.
      this.log("QR encode failed:", err);
      this.setStatus("qr", { link, expiresAt });
    }
  }

  private async encodeQr(text: string): Promise<string> {
    if (this.deps.encodeQr) return this.deps.encodeQr(text);
    const qrcode = await import("qrcode");
    return qrcode.toDataURL(text, { margin: 2, width: 512 });
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (this._status !== "connected") throw new Error("Telegram is not connected");
    await this.sendRaw(msg);
  }

  /** Send bypassing the connected check — used for pairing confirmations. */
  private async sendRaw(msg: OutboundMessage): Promise<void> {
    const body: Record<string, unknown> = {
      chat_id: msg.conversationId,
      text: msg.text,
    };
    if (msg.choices?.length) {
      // One button per row: model names are long and a 2-column grid truncates
      // them to the point of being unreadable on a phone.
      body["reply_markup"] = {
        inline_keyboard: msg.choices.map((choice) => [{
          text: choice.label.slice(0, TELEGRAM_BUTTON_LABEL_MAX),
          callback_data: this.rememberChoice(choice.value),
        }]),
      };
    }
    const res = await this.api("sendMessage", body, this.abort?.signal);
    if (!res.ok) throw new Error(res.description ?? "Telegram sendMessage failed");
  }

  /**
   * Show "typing…" until the returned function is called. Telegram drops the
   * indicator after about five seconds, so it is refreshed on a shorter beat
   * for as long as the turn runs.
   */
  startTyping(conversationId: string): () => void {
    const send = () => {
      void this.api("sendChatAction", { chat_id: conversationId, action: "typing" }, this.abort?.signal)
        .catch(() => { /* the indicator is decoration; never fail a turn over it */ });
    };
    send();
    const timer = setInterval(send, TYPING_REFRESH_MS);
    return () => clearInterval(timer);
  }

  /**
   * Send a message and hand back its id, so the turn can keep editing it as
   * work progresses instead of spamming the chat with one message per step.
   */
  async sendLive(conversationId: string, text: string): Promise<string | null> {
    try {
      const res = await this.api<{ message_id?: number }>("sendMessage", {
        chat_id: conversationId,
        text,
      }, this.abort?.signal);
      const id = res.result?.message_id;
      return res.ok && id !== undefined ? String(id) : null;
    } catch (err) {
      this.log("live message failed:", err);
      return null;
    }
  }

  /** Replace a live message's text. Never throws — progress is not the payload. */
  async editLive(conversationId: string, messageId: string, text: string): Promise<void> {
    try {
      await this.api("editMessageText", {
        chat_id: conversationId,
        message_id: Number(messageId),
        text,
      }, this.abort?.signal);
    } catch (err) {
      this.log("live message edit failed:", err);
    }
  }

  /**
   * Store a choice's value behind a short token. `callback_data` is capped at
   * 64 bytes, which many model ids exceed, so the button carries a token and
   * the connector keeps the mapping.
   */
  private rememberChoice(value: string): string {
    const token = `c${(this.choiceSeq += 1).toString(36)}`;
    this.choiceValues.set(token, value);
    // Bounded so a long-lived connector cannot grow this without limit; the
    // oldest dialogs are the ones nobody is going to tap any more.
    while (this.choiceValues.size > MAX_REMEMBERED_CHOICES) {
      const oldest = this.choiceValues.keys().next().value;
      if (oldest === undefined) break;
      this.choiceValues.delete(oldest);
    }
    return token;
  }

  /**
   * A tapped button. Telegram spins a loading indicator until the query is
   * answered, so that happens first; the choice is then replayed through the
   * normal inbound path so buttons and typed commands share one dispatcher.
   */
  private async handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
    const value = query.data ? this.choiceValues.get(query.data) : undefined;

    // Stops the client's loading spinner. Fired without awaiting so the actual
    // answer isn't queued behind a second round-trip to Telegram.
    void this.api("answerCallbackQuery", {
      callback_query_id: query.id,
      ...(value ? {} : { text: "That menu has expired — send /model again." }),
    }, this.abort?.signal).catch((err) => { this.log("answerCallbackQuery failed:", err); });

    if (!value || !query.message) return;

    // Drop the keyboard so the dialog cannot be answered twice. Not awaited:
    // it is cosmetic, and making the user wait a Telegram round-trip for it
    // before the answer is even dispatched is the wrong trade.
    void this.api("editMessageReplyMarkup", {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
    }, this.abort?.signal).catch(() => { /* cosmetic only */ });

    const inbound = telegramMessageToInbound({
      ...query.message,
      from: query.from,
      text: value,
    });
    if (inbound) this.events?.onInbound(inbound);
  }

  /**
   * Handle a `/start` command. Returns true when the message was consumed
   * (pairing handshake or greeting) and must not reach the agent.
   */
  private async handleStart(message: TelegramMessage, payload: string): Promise<boolean> {
    const inbound = telegramMessageToInbound(message);
    if (!inbound) return true;

    // An expired code must not pair: the QR may be on a screen someone else can
    // see long after the user walked away from it.
    const expired = this.pairingExpiresAt > 0 && Date.now() > this.pairingExpiresAt;
    if (expired && this.pairingCode) {
      this.log("pairing code expired before it was scanned");
      this.pairingCode = null;
    }

    if (this.pairingCode && payload === this.pairingCode) {
      this.pairingCode = null;
      this.pairingExpiresAt = 0;
      this.events?.onPaired?.({
        senderId: inbound.senderId,
        senderName: inbound.senderName,
        conversationId: inbound.conversationId,
      });
      this.log(`paired with ${inbound.senderName ?? inbound.senderId}`);
      this.setStatus("connected");
      // The QR is scanned on a phone, so the confirmation carries the way back
      // to Jait — otherwise the user is left sitting in Telegram.
      const backLink = this.returnUrl ? `\n\n🔗 Back to Jait: ${this.returnUrl}` : "";
      await this.sendRaw({
        conversationId: inbound.conversationId,
        text: `✅ Linked to Jait. Send me a message and I'll get to work.${backLink}`,
      }).catch((err) => { this.log("pairing confirmation failed:", err); });
      return true;
    }

    // A stale or missing code — don't leak whether pairing is pending.
    await this.sendRaw({
      conversationId: inbound.conversationId,
      text: this.pairingCode
        ? "That link has expired. Open Jait → Settings → Channels and scan the current QR code."
        : "👋 I'm Jait. Just send me a message.",
    }).catch((err) => { this.log("start reply failed:", err); });
    return true;
  }

  /**
   * Long-poll Telegram for updates until the connector is stopped.
   *
   * A dropped long poll is routine, not fatal: the request sits open for half a
   * minute, so every NAT timeout, suspended laptop and Telegram hiccup lands
   * here. Treating that as terminal left the channel stuck on "error" until
   * someone toggled it by hand — so failures back off and retry, and only a
   * rejected token gives up. The badge flips to error once the failures persist
   * and back to connected on the first good poll, so it stays truthful without
   * flickering on every blip.
   */
  private async pollLoop(): Promise<void> {
    const signal = this.abort?.signal;
    if (!signal) return;
    let failures = 0;

    while (!signal.aborted) {
      try {
        const res = await this.poll(signal);
        if (!res.ok) {
          throw new TelegramApiError(res.description ?? "Telegram getUpdates failed", res.error_code);
        }
        if (failures > 0) {
          failures = 0;
          this.recoverFromPollFailure();
        }
        for (const update of res.result ?? []) {
          this.offset = Math.max(this.offset, update.update_id + 1);

          if (update.callback_query) {
            await this.handleCallbackQuery(update.callback_query);
            continue;
          }
          if (!update.message) continue;

          const payload = update.message.text ? parseStartPayload(update.message.text) : null;
          if (payload !== null) {
            await this.handleStart(update.message, payload);
            continue;
          }

          const inbound = telegramMessageToInbound(update.message);
          if (inbound) this.events?.onInbound(inbound);
        }
      } catch (err) {
        if (signal.aborted) return;
        failures += 1;
        const code = err instanceof TelegramApiError ? err.errorCode : undefined;
        const detail = describePollFailure(err instanceof Error ? err.message : String(err), code);

        if (isFatalPollError(code)) {
          this.reportPollFailure(detail);
          return;
        }

        // A 409 means someone else holds the bot. Retrying fast would only make
        // the two instances steal updates from each other, so wait the full
        // ceiling and surface it right away — that one is a setup problem.
        const conflict = code === TELEGRAM_CONFLICT;
        const wait = conflict
          ? (this.deps.pollRetryMaxMs ?? POLL_RETRY_MAX_MS)
          : this.backoffFor(failures);
        this.log(`poll failed (attempt ${failures}, retrying in ${wait}ms): ${detail}`);
        if (conflict || failures >= POLL_FAILURES_BEFORE_ERROR) this.reportPollFailure(detail);
        await delay(wait, signal);
      }
    }
  }

  /** One long poll, abandoned if it stalls past the watchdog budget. */
  private async poll(signal: AbortSignal): Promise<TelegramResponse<TelegramUpdate[]>> {
    const timeoutSeconds = this.deps.pollTimeoutSeconds ?? DEFAULT_POLL_TIMEOUT_SECONDS;
    const budgetMs = timeoutSeconds * 1_000 + POLL_WATCHDOG_GRACE_MS;
    return await this.api<TelegramUpdate[]>("getUpdates", {
      timeout: timeoutSeconds,
      offset: this.offset,
      allowed_updates: ["message", "callback_query"],
    }, AbortSignal.any([signal, AbortSignal.timeout(budgetMs)]));
  }

  /** Backoff for the nth consecutive failure, honouring the injected bounds. */
  private backoffFor(attempt: number): number {
    return pollBackoffMs(attempt, this.deps.pollRetryMinMs, this.deps.pollRetryMaxMs);
  }

  /**
   * Surface a failure the retries are not getting past. Reported once per
   * distinct cause, so a long outage doesn't emit a status update per attempt.
   */
  private reportPollFailure(detail: string): void {
    // A blip mid-pairing must not wipe the QR the user is about to scan.
    if (this._status === "qr") {
      this.log(`poll failing while pairing: ${detail}`);
      return;
    }
    if (this._status === "error" && this.lastPollError === detail) return;
    this.lastPollError = detail;
    this.setStatus("error", { error: detail });
  }

  /** A poll succeeded again — put the badge back. */
  private recoverFromPollFailure(): void {
    this.lastPollError = null;
    if (this._status !== "error") return;
    this.log("polling recovered");
    this.setStatus("connected");
  }

  private async api<T>(
    method: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<TelegramResponse<T>> {
    const token = this.token();
    const fetchImpl = this.deps.fetchImpl ?? fetch;
    const res = await fetchImpl(`${this.baseUrl}/bot${token}/${method}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    return await res.json() as TelegramResponse<T>;
  }
}
