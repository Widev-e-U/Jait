import type {
  ChannelConnector,
  ChannelConnectorEvents,
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

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export interface TelegramConnectorDeps {
  token?: string;
  baseUrl?: string;
  pollTimeoutSeconds?: number;
  fetchImpl?: typeof fetch;
  log?: (msg: string, ...args: unknown[]) => void;
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

export class TelegramConnector implements ChannelConnector {
  readonly id = "telegram";
  readonly label = "Telegram";

  private readonly deps: TelegramConnectorDeps;
  private readonly baseUrl: string;
  private _status: ChannelStatus = "stopped";
  private events: ChannelConnectorEvents | null = null;
  private abort: AbortController | null = null;
  private offset = 0;

  constructor(deps: TelegramConnectorDeps = {}) {
    this.deps = deps;
    this.baseUrl = deps.baseUrl ?? "https://api.telegram.org";
  }

  status(): ChannelStatus { return this._status; }
  currentQr(): string | null { return null; }

  private log(msg: string, ...args: unknown[]) {
    (this.deps.log ?? ((m, ...a) => console.log("[telegram]", m, ...a)))(msg, ...args);
  }

  private token(): string {
    return this.deps.token ?? process.env.TELEGRAM_BOT_TOKEN ?? "";
  }

  private setStatus(status: ChannelStatus, detail?: { error?: string }) {
    this._status = status;
    this.events?.onStatus(status, detail);
  }

  async start(events: ChannelConnectorEvents): Promise<void> {
    this.events = events;
    const token = this.token();
    if (!token) {
      this.setStatus("error", { error: "TELEGRAM_BOT_TOKEN is required" });
      return;
    }

    this.abort?.abort();
    this.abort = new AbortController();
    this.setStatus("connecting");

    try {
      const me = await this.api<TelegramUser>("getMe", undefined, this.abort.signal);
      if (!me.ok) throw new Error(me.description ?? "Telegram getMe failed");
      this.setStatus("connected");
      this.log(`connected as ${me.result?.username ?? me.result?.id ?? "bot"}`);
      void this.pollLoop();
    } catch (err) {
      if (this.abort.signal.aborted) return;
      this.setStatus("error", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  async stop(): Promise<void> {
    this.abort?.abort();
    this.abort = null;
    this.setStatus("stopped");
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (this._status !== "connected") throw new Error("Telegram is not connected");
    const res = await this.api("sendMessage", {
      chat_id: msg.conversationId,
      text: msg.text,
    }, this.abort?.signal);
    if (!res.ok) throw new Error(res.description ?? "Telegram sendMessage failed");
  }

  private async pollLoop(): Promise<void> {
    const signal = this.abort?.signal;
    if (!signal) return;

    while (!signal.aborted) {
      try {
        const res = await this.api<TelegramUpdate[]>("getUpdates", {
          timeout: this.deps.pollTimeoutSeconds ?? 25,
          offset: this.offset,
          allowed_updates: ["message"],
        }, signal);
        if (!res.ok) throw new Error(res.description ?? "Telegram getUpdates failed");
        for (const update of res.result ?? []) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          if (!update.message) continue;
          const inbound = telegramMessageToInbound(update.message);
          if (inbound) this.events?.onInbound(inbound);
        }
      } catch (err) {
        if (signal.aborted) return;
        this.setStatus("error", { error: err instanceof Error ? err.message : String(err) });
        return;
      }
    }
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
