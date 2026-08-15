import { describe, expect, it, vi } from "vitest";
import {
  TELEGRAM_MAX_COMMANDS,
  TelegramConnector,
  botFatherSetupLink,
  describePollFailure,
  extractBotToken,
  generateUsernameSlug,
  isFatalPollError,
  isPaired,
  pollBackoffMs,
  parseStartPayload,
  sanitizeReturnUrl,
  suggestBotUsername,
  telegramMessageToInbound,
  toTelegramCommands,
} from "./connector.js";
import type { ChannelPairing, ChannelStatus, ChannelStatusDetail, InboundMessage } from "../types.js";

describe("TelegramConnector", () => {
  it("converts text messages to inbound channel messages", () => {
    const inbound = telegramMessageToInbound({
      message_id: 10,
      date: 1_700_000_000,
      chat: { id: 123 },
      from: { id: 456, username: "alice" },
      text: "hello",
    });

    expect(inbound).toMatchObject({
      channelId: "telegram",
      conversationId: "123",
      senderId: "456",
      senderName: "@alice",
      text: "hello",
      fromMe: false,
      isSelfChat: false,
    });
  });

  it("reports an error when no bot token is configured", async () => {
    const statuses: Array<{ status: ChannelStatus; error?: string }> = [];
    const connector = new TelegramConnector({ token: "" });

    await connector.start({
      onInbound: () => {},
      onStatus: (status, detail) => { statuses.push({ status, error: detail?.error }); },
    });

    expect(statuses).toHaveLength(1);
    expect(statuses[0]!.status).toBe("error");
    expect(statuses[0]!.error).toMatch(/@BotFather/);
  });

  describe("parseStartPayload", () => {
    it("extracts the deep-link payload", () => {
      expect(parseStartPayload("/start abc123")).toBe("abc123");
      expect(parseStartPayload("/start@jait_bot abc123")).toBe("abc123");
    });

    it("returns an empty payload for a bare /start", () => {
      expect(parseStartPayload("/start")).toBe("");
    });

    it("ignores ordinary messages", () => {
      expect(parseStartPayload("start the build")).toBeNull();
      expect(parseStartPayload("/startup")).toBeNull();
    });
  });

  describe("isPaired", () => {
    it("is true once a sender is allowlisted or everyone may talk", () => {
      expect(isPaired({ allowedSenders: ["123"] })).toBe(true);
      expect(isPaired({ respondToAll: true })).toBe(true);
    });

    it("is false for a fresh channel", () => {
      expect(isPaired({})).toBe(false);
      expect(isPaired(undefined)).toBe(false);
    });
  });

  describe("extractBotToken", () => {
    it("picks the token out of the whole BotFather reply", () => {
      const reply = [
        "Done! Congratulations on your new bot.",
        "Use this token to access the HTTP API:",
        "8123456789:AAF-mK3sample_TOKEN-value_1234567890x",
        "Keep your token secure.",
      ].join("\n");

      expect(extractBotToken(reply)).toBe("8123456789:AAF-mK3sample_TOKEN-value_1234567890x");
    });

    it("accepts a bare token", () => {
      expect(extractBotToken("  8123456789:AAF-mK3sample_TOKEN-value_1234567890x  "))
        .toBe("8123456789:AAF-mK3sample_TOKEN-value_1234567890x");
    });

    it("returns null when nothing token-shaped is present", () => {
      expect(extractBotToken("no token here")).toBeNull();
      expect(extractBotToken("123:short")).toBeNull();
    });
  });

  describe("sanitizeReturnUrl", () => {
    it("keeps http(s) URLs", () => {
      expect(sanitizeReturnUrl("https://jait.example/settings")).toBe("https://jait.example/settings");
      expect(sanitizeReturnUrl("http://localhost:8010/")).toBe("http://localhost:8010/");
    });

    it("drops anything that is not http(s)", () => {
      expect(sanitizeReturnUrl("javascript:alert(1)")).toBeUndefined();
      expect(sanitizeReturnUrl("tg://resolve?domain=x")).toBeUndefined();
      expect(sanitizeReturnUrl("not a url")).toBeUndefined();
      expect(sanitizeReturnUrl("")).toBeUndefined();
      expect(sanitizeReturnUrl(undefined)).toBeUndefined();
    });
  });

  describe("setup guide", () => {
    it("deep-links to BotFather with /newbot prefilled", () => {
      expect(botFatherSetupLink()).toBe("https://t.me/BotFather?text=%2Fnewbot");
    });

    it("suggests a username Telegram accepts", () => {
      const username = suggestBotUsername("abc123");
      expect(username).toBe("jait_abc123_bot");
      expect(username.endsWith("bot")).toBe(true);
      expect(username.length).toBeGreaterThanOrEqual(5);
      expect(username.length).toBeLessThanOrEqual(32);
      expect(username).toMatch(/^[A-Za-z0-9_]+$/);
    });

    it("returns link, QR and suggestions", async () => {
      const connector = new TelegramConnector({
        encodeQr: async (text) => `data:image/png;base64,${Buffer.from(text).toString("base64")}`,
      });

      const guide = await connector.setupGuide();

      expect(guide.link).toBe("https://t.me/BotFather?text=%2Fnewbot");
      expect(guide.qr).toMatch(/^data:image\/png;base64,/);
      expect(guide.suggestedName).toBe("Jait Assistant");
      expect(guide.suggestedUsername).toMatch(/^jait_[a-z2-7]{16}_bot$/);
    });

    it("still returns the link when QR encoding fails", async () => {
      const connector = new TelegramConnector({
        encodeQr: async () => { throw new Error("no encoder"); },
        log: () => {},
      });

      const guide = await connector.setupGuide();

      expect(guide.qr).toBeNull();
      expect(guide.link).toContain("BotFather");
    });
  });

  /**
   * Fake Bot API: getMe resolves the bot username, the first getUpdates poll
   * delivers the scripted updates, later polls hang until the connector stops.
   */
  function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }

  const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });

  it("shows a deep-link QR while unpaired", async () => {
    const { fetchImpl } = fakeApi([]);
    const details: ChannelStatusDetail[] = [];
    const connector = new TelegramConnector({
      token: "t",
      fetchImpl,
      makePairingCode: () => "CODE123",
      encodeQr: async (text) => `data:image/png;base64,${Buffer.from(text).toString("base64")}`,
    });

    await connector.start({
      onInbound: () => {},
      onStatus: (_status, detail) => { if (detail) details.push(detail); },
    }, {});

    expect(connector.status()).toBe("qr");
    expect(connector.currentLink()).toBe("https://t.me/jait_bot?start=CODE123");
    expect(connector.currentQr()).toMatch(/^data:image\/png;base64,/);
    await connector.stop();
  });

  it("pairs the user that scans the QR and reports their id", async () => {
    const { fetchImpl, sent } = fakeApi([startUpdate("CODE123")]);
    const paired: ChannelPairing[] = [];
    const connector = new TelegramConnector({
      token: "t",
      fetchImpl,
      makePairingCode: () => "CODE123",
      encodeQr: async () => "data:image/png;base64,x",
    });

    await connector.start({
      onInbound: () => {},
      onStatus: () => {},
      onPaired: (p) => { paired.push(p); },
    }, {});

    await vi.waitFor(() => expect(paired).toHaveLength(1));
    expect(paired[0]).toMatchObject({ senderId: "4242", senderName: "@lukas", conversationId: "4242" });
    expect(connector.status()).toBe("connected");
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(String(sent[0]!.text)).toContain("Linked to Jait");
    await connector.stop();
  });

  it("sends the way back to Jait with the pairing confirmation", async () => {
    const { fetchImpl, sent } = fakeApi([startUpdate("CODE123")]);
    const connector = new TelegramConnector({
      token: "t",
      fetchImpl,
      makePairingCode: () => "CODE123",
      encodeQr: async () => "data:image/png;base64,x",
    });

    await connector.start(
      { onInbound: () => {}, onStatus: () => {} },
      {},
      { returnUrl: "https://jait.example/settings" },
    );

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(String(sent[0]!.text)).toContain("https://jait.example/settings");
    await connector.stop();
  });

  it("keeps a non-http return url out of the message", async () => {
    const { fetchImpl, sent } = fakeApi([startUpdate("CODE123")]);
    const connector = new TelegramConnector({
      token: "t",
      fetchImpl,
      makePairingCode: () => "CODE123",
      encodeQr: async () => "data:image/png;base64,x",
    });

    await connector.start(
      { onInbound: () => {}, onStatus: () => {} },
      {},
      { returnUrl: "javascript:alert(1)" },
    );

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(String(sent[0]!.text)).not.toContain("javascript");
    expect(String(sent[0]!.text)).toContain("Linked to Jait");
    await connector.stop();
  });

  it("does not pair on a stale code and never forwards /start to the agent", async () => {
    const { fetchImpl, sent } = fakeApi([startUpdate("WRONG")]);
    const paired: ChannelPairing[] = [];
    const inbound: unknown[] = [];
    const connector = new TelegramConnector({
      token: "t",
      fetchImpl,
      makePairingCode: () => "CODE123",
      encodeQr: async () => "data:image/png;base64,x",
    });

    await connector.start({
      onInbound: (msg) => { inbound.push(msg); },
      onStatus: () => {},
      onPaired: (p) => { paired.push(p); },
    }, {});

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(paired).toHaveLength(0);
    expect(inbound).toHaveLength(0);
    expect(connector.status()).toBe("qr");
    await connector.stop();
  });

  it("connects straight through when already paired", async () => {
    const { fetchImpl } = fakeApi([]);
    const connector = new TelegramConnector({ token: "t", fetchImpl });

    await connector.start({ onInbound: () => {}, onStatus: () => {} }, { allowedSenders: ["4242"] });

    expect(connector.status()).toBe("connected");
    expect(connector.currentQr()).toBeNull();
    await connector.stop();
  });

  it("reads the bot token from the channel config", async () => {
    const { fetchImpl } = fakeApi([]);
    const connector = new TelegramConnector({ fetchImpl });

    await connector.start(
      { onInbound: () => {}, onStatus: () => {} },
      { token: "from-config", allowedSenders: ["1"] },
    );

    expect(connector.status()).toBe("connected");
    expect(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0])).toContain("/botfrom-config/");
    await connector.stop();
  });
});

describe("command menu", () => {
  it("normalises names and descriptions to what setMyCommands accepts", () => {
    const commands = toTelegramCommands([
      { name: "Model", description: "Switch model" },
      { name: "my-command", description: "Hyphens are not allowed" },
      { name: "model", description: "duplicate — dropped" },
      { name: "", description: "no name" },
      { name: "empty", description: "   " },
      { name: "x".repeat(40), description: "y".repeat(300) },
    ]);

    expect(commands).toEqual([
      { command: "model", description: "Switch model" },
      { command: "my_command", description: "Hyphens are not allowed" },
      { command: "x".repeat(32), description: "y".repeat(256) },
    ]);
  });

  it("stays within Telegram's 100-command cap", () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ name: `cmd${i}`, description: `Command ${i}` }));
    expect(toTelegramCommands(many)).toHaveLength(TELEGRAM_MAX_COMMANDS);
  });

  it("registers the menu for every scope", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const body = (init as { body?: string } | undefined)?.body;
      if (String(url).endsWith("/setMyCommands")) calls.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
      return { json: async () => ({ ok: true }) } as unknown as Response;
    });
    const connector = new TelegramConnector({ token: "t", fetchImpl: fetchImpl as unknown as typeof fetch });

    await connector.setCommandMenu([{ name: "model", description: "Switch model" }]);

    expect(calls.map((c) => (c.scope as { type: string }).type))
      .toEqual(["default", "all_private_chats", "all_group_chats"]);
    expect(calls[0]!.commands).toEqual([{ command: "model", description: "Switch model" }]);
  });

  it("survives a rejected scope without throwing", async () => {
    const fetchImpl = vi.fn(async (url: unknown) => {
      if (String(url).endsWith("/setMyCommands")) throw new Error("network down");
      return { json: async () => ({ ok: true }) } as unknown as Response;
    });
    const connector = new TelegramConnector({
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: () => {},
    });

    await expect(connector.setCommandMenu([{ name: "model", description: "Switch model" }])).resolves.toBeUndefined();
  });

  it("does nothing without a token", async () => {
    const fetchImpl = vi.fn();
    const connector = new TelegramConnector({ token: "", fetchImpl: fetchImpl as unknown as typeof fetch });

    await connector.setCommandMenu([{ name: "model", description: "Switch model" }]);

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("choice dialogs", () => {
  /** Bot API fake that records sends and replays a button tap as an update. */
  function dialogApi() {
    const sent: Array<Record<string, unknown>> = [];
    const answered: Array<Record<string, unknown>> = [];
    const edited: Array<Record<string, unknown>> = [];
    let pending: unknown[] = [];
    let polls = 0;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = JSON.parse((init as { body?: string } | undefined)?.body ?? "{}") as Record<string, unknown>;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) { sent.push(body); return json({ ok: true, result: { message_id: 7 } }); }
      if (path.endsWith("/answerCallbackQuery")) { answered.push(body); return json({ ok: true }); }
      if (path.endsWith("/editMessageReplyMarkup")) { edited.push(body); return json({ ok: true }); }
      if (path.endsWith("/setMyCommands")) return json({ ok: true });
      if (path.endsWith("/getUpdates")) {
        polls += 1;
        if (pending.length) { const batch = pending; pending = []; return json({ ok: true, result: batch }); }
        // Keep long-polling like the real API instead of parking forever, so an
        // update queued after the first poll is still picked up.
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sent, answered, edited,
      pollCount: () => polls,
      tap: (data: string) => { pending = [{ update_id: 99, callback_query: { id: "q1", data, from: { id: 4242, username: "lukas" }, message: { message_id: 7, chat: { id: 4242, type: "private" } } } }]; },
    };
  }

  it("renders choices as an inline keyboard", async () => {
    const api = dialogApi();
    const connector = new TelegramConnector({ token: "t", fetchImpl: api.fetchImpl });
    await connector.start({ onInbound: () => {}, onStatus: () => {} }, { allowedSenders: ["4242"] });

    await connector.send({
      conversationId: "4242",
      text: "Pick one:",
      choices: [{ label: "GPT-4o", value: "/model gpt-4o" }, { label: "Llama 3", value: "/model llama3" }],
    });

    const markup = api.sent.at(-1)!["reply_markup"] as { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
    expect(markup.inline_keyboard.map((row) => row[0]!.text)).toEqual(["GPT-4o", "Llama 3"]);
    // Values ride in the token map, not in callback_data (64-byte cap).
    for (const row of markup.inline_keyboard) {
      expect(row[0]!.callback_data.length).toBeLessThanOrEqual(64);
      expect(row[0]!.callback_data).not.toContain("/model");
    }
    await connector.stop();
  });

  it("replays a tapped button through the inbound path", async () => {
    const api = dialogApi();
    const inbound: InboundMessage[] = [];
    const connector = new TelegramConnector({ token: "t", fetchImpl: api.fetchImpl });
    await connector.start({ onInbound: (m) => { inbound.push(m); }, onStatus: () => {} }, { allowedSenders: ["4242"] });

    await connector.send({
      conversationId: "4242",
      text: "Pick one:",
      choices: [{ label: "Llama 3", value: "/model llama3" }],
    });
    const markup = api.sent.at(-1)!["reply_markup"] as { inline_keyboard: Array<Array<{ callback_data: string }>> };
    api.tap(markup.inline_keyboard[0]![0]!.callback_data);

    await vi.waitFor(() => expect(inbound).toHaveLength(1));
    expect(inbound[0]).toMatchObject({ text: "/model llama3", senderId: "4242", conversationId: "4242" });
    expect(api.answered).toHaveLength(1);
    // Keyboard removed so the dialog cannot be answered twice.
    expect(api.edited).toHaveLength(1);
    await connector.stop();
  });

  it("tells the user when a menu has expired", async () => {
    const api = dialogApi();
    const inbound: InboundMessage[] = [];
    const connector = new TelegramConnector({ token: "t", fetchImpl: api.fetchImpl });
    await connector.start({ onInbound: (m) => { inbound.push(m); }, onStatus: () => {} }, { allowedSenders: ["4242"] });

    api.tap("c999");

    await vi.waitFor(() => expect(api.answered).toHaveLength(1));
    expect(String(api.answered[0]!["text"])).toMatch(/expired/i);
    expect(inbound).toHaveLength(0);
    await connector.stop();
  });

  it("sends no keyboard for a plain message", async () => {
    const api = dialogApi();
    const connector = new TelegramConnector({ token: "t", fetchImpl: api.fetchImpl });
    await connector.start({ onInbound: () => {}, onStatus: () => {} }, { allowedSenders: ["4242"] });

    await connector.send({ conversationId: "4242", text: "hello" });

    expect(api.sent.at(-1)!["reply_markup"]).toBeUndefined();
    await connector.stop();
  });
});

describe("pairing code expiry", () => {
  function api() {
    const fetchImpl = vi.fn(async (url: unknown) => {
      const path = String(url);
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;
      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) return json({ ok: true, result: {} });
      if (path.endsWith("/getUpdates")) {
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: true, result: {} });
    });
    return fetchImpl as unknown as typeof fetch;
  }

  it("reports when the shown code stops working", async () => {
    const details: ChannelStatusDetail[] = [];
    const connector = new TelegramConnector({
      token: "t",
      fetchImpl: api(),
      makePairingCode: () => "CODE123",
      encodeQr: async () => "data:image/png;base64,x",
      pairingTtlMs: 60_000,
    });

    await connector.start({
      onInbound: () => {},
      onStatus: (_status, detail) => { if (detail) details.push(detail); },
    }, {});

    const expiresAt = details.at(-1)!.expiresAt;
    expect(expiresAt).toBeDefined();
    const remaining = new Date(expiresAt!).getTime() - Date.now();
    expect(remaining).toBeGreaterThan(50_000);
    expect(remaining).toBeLessThanOrEqual(60_000);
    expect(connector.currentExpiry()).toBe(expiresAt);
    await connector.stop();
  });

  it("clears the deadline once linked or stopped", async () => {
    const connector = new TelegramConnector({
      token: "t",
      fetchImpl: api(),
      encodeQr: async () => "data:image/png;base64,x",
    });

    await connector.start({ onInbound: () => {}, onStatus: () => {} }, {});
    expect(connector.currentExpiry()).not.toBeNull();

    await connector.stop();
    expect(connector.currentExpiry()).toBeNull();
  });

  it("refuses an expired code instead of pairing", async () => {
    const paired: ChannelPairing[] = [];
    const sent: Array<Record<string, unknown>> = [];
    let pending: unknown[] = [];
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;
      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse((init as { body?: string }).body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (pending.length) { const batch = pending; pending = []; return json({ ok: true, result: batch }); }
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: true, result: {} });
    });

    const connector = new TelegramConnector({
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      makePairingCode: () => "CODE123",
      encodeQr: async () => "data:image/png;base64,x",
      pairingTtlMs: 20,
    });
    await connector.start({
      onInbound: () => {},
      onStatus: () => {},
      onPaired: (p) => { paired.push(p); },
    }, {});

    await new Promise((r) => setTimeout(r, 50)); // let the code lapse
    pending = [{
      update_id: 1,
      message: { message_id: 1, date: 1, chat: { id: 4242, type: "private" }, from: { id: 4242 }, text: "/start CODE123" },
    }];

    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0));
    expect(paired).toHaveLength(0);
    expect(String(sent.at(-1)!["text"])).toMatch(/expired|Jait/i);
    await connector.stop();
  });
});

describe("poll resilience", () => {
  /** One scripted answer to a `getUpdates` poll. */
  type PollStep = {
    /** Deliver these updates. */
    updates?: unknown[];
    /** Reject the request, the way a dropped socket does. */
    throws?: string;
    /** Answer `ok: false`, the way the Bot API reports a refusal. */
    fails?: { error_code?: number; description: string };
  };

  /**
   * Bot API fake whose polls follow a script. Steps past the end idle quietly,
   * like a real long poll with nothing to report.
   */
  function scriptedApi(steps: PollStep[], opts?: { getMeFailures?: number }) {
    const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;
    let polled = 0;
    let getMeCalls = 0;
    const fetchImpl = vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith("/getMe")) {
        getMeCalls += 1;
        if (getMeCalls <= (opts?.getMeFailures ?? 0)) throw new TypeError("fetch failed");
        return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      }
      if (path.endsWith("/sendMessage")) return json({ ok: true, result: { message_id: 1 } });
      if (path.endsWith("/getUpdates")) {
        const step = steps[polled];
        polled += 1;
        if (step?.throws) throw new TypeError(step.throws);
        if (step?.fails) return json({ ok: false, ...step.fails });
        if (step?.updates) return json({ ok: true, result: step.updates });
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pollCount: () => polled,
      getMeCount: () => getMeCalls,
    };
  }

  const textUpdate = (text: string, id = 1) => ({
    update_id: id,
    message: { message_id: id, date: 1, chat: { id: 4242, type: "private" }, from: { id: 4242 }, text },
  });

  /** A connector wired to a paired channel with test-speed backoff. */
  function pairedConnector(fetchImpl: typeof fetch) {
    return new TelegramConnector({ token: "t", fetchImpl, pollRetryMinMs: 1, pollRetryMaxMs: 2 });
  }

  it("keeps polling after a dropped long poll", async () => {
    const api = scriptedApi([{ throws: "fetch failed" }, { updates: [textUpdate("hello")] }]);
    const inbound: InboundMessage[] = [];
    const connector = pairedConnector(api.fetchImpl);

    await connector.start(
      { onInbound: (m) => { inbound.push(m); }, onStatus: () => {} },
      { allowedSenders: ["4242"] },
    );

    // The message arrives on the poll *after* the failure — the loop used to
    // die on the first dropped request and never come back.
    await vi.waitFor(() => expect(inbound).toHaveLength(1));
    expect(inbound[0]!.text).toBe("hello");
    expect(connector.status()).toBe("connected");
    await connector.stop();
  });

  it("reports an error once the failures persist, and clears it on recovery", async () => {
    const api = scriptedApi([
      { throws: "fetch failed" },
      { throws: "fetch failed" },
      { throws: "fetch failed" },
      { updates: [textUpdate("back")] },
    ]);
    const statuses: ChannelStatus[] = [];
    const connector = pairedConnector(api.fetchImpl);

    await connector.start(
      { onInbound: () => {}, onStatus: (status) => { statuses.push(status); } },
      { allowedSenders: ["4242"] },
    );

    await vi.waitFor(() => expect(statuses).toContain("error"));
    await vi.waitFor(() => expect(connector.status()).toBe("connected"));
    // One badge per outage, not one per attempt.
    expect(statuses.filter((s) => s === "error")).toHaveLength(1);
    await connector.stop();
  });

  it("names the competing instance behind a 409 and keeps trying", async () => {
    const api = scriptedApi([
      { fails: { error_code: 409, description: "Conflict: terminated by other getUpdates request" } },
      { updates: [textUpdate("mine")] },
    ]);
    const details: ChannelStatusDetail[] = [];
    const inbound: InboundMessage[] = [];
    const connector = pairedConnector(api.fetchImpl);

    await connector.start(
      { onInbound: (m) => { inbound.push(m); }, onStatus: (_s, detail) => { if (detail) details.push(detail); } },
      { allowedSenders: ["4242"] },
    );

    await vi.waitFor(() => expect(details.some((d) => /only one/i.test(d.error ?? ""))).toBe(true));
    await vi.waitFor(() => expect(inbound).toHaveLength(1));
    await connector.stop();
  });

  it("stops polling when the bot token is rejected", async () => {
    const api = scriptedApi([{ fails: { error_code: 401, description: "Unauthorized" } }]);
    const details: ChannelStatusDetail[] = [];
    const connector = pairedConnector(api.fetchImpl);

    await connector.start(
      { onInbound: () => {}, onStatus: (_s, detail) => { if (detail) details.push(detail); } },
      { allowedSenders: ["4242"] },
    );

    await vi.waitFor(() => expect(connector.status()).toBe("error"));
    expect(details.at(-1)!.error).toMatch(/@BotFather/);

    // A rejected token is not going to fix itself — no retry storm.
    const polls = api.pollCount();
    await new Promise((r) => setTimeout(r, 30));
    expect(api.pollCount()).toBe(polls);
    await connector.stop();
  });

  it("retries the handshake when Telegram is unreachable at start", async () => {
    const api = scriptedApi([{ updates: [textUpdate("later")] }], { getMeFailures: 1 });
    const inbound: InboundMessage[] = [];
    const connector = pairedConnector(api.fetchImpl);

    await connector.start(
      { onInbound: (m) => { inbound.push(m); }, onStatus: () => {} },
      { allowedSenders: ["4242"] },
    );

    // Visible as broken straight away, but not abandoned.
    expect(connector.status()).toBe("error");
    await vi.waitFor(() => expect(connector.status()).toBe("connected"));
    await vi.waitFor(() => expect(inbound).toHaveLength(1));
    await connector.stop();
  });

  describe("classification", () => {
    it("treats a rejected token as fatal and everything else as retryable", () => {
      expect(isFatalPollError(401)).toBe(true);
      expect(isFatalPollError(404)).toBe(true);
      expect(isFatalPollError(409)).toBe(false);
      expect(isFatalPollError(502)).toBe(false);
      expect(isFatalPollError(undefined)).toBe(false);
    });

    it("backs off exponentially up to the ceiling", () => {
      expect(pollBackoffMs(1, 1_000, 30_000)).toBe(1_000);
      expect(pollBackoffMs(2, 1_000, 30_000)).toBe(2_000);
      expect(pollBackoffMs(3, 1_000, 30_000)).toBe(4_000);
      expect(pollBackoffMs(99, 1_000, 30_000)).toBe(30_000);
    });

    it("explains a conflict in terms of the second instance", () => {
      expect(describePollFailure("Conflict: terminated by other getUpdates request", 409))
        .toMatch(/only one/i);
      expect(describePollFailure("Unauthorized", 401)).toMatch(/@BotFather/);
      expect(describePollFailure("fetch failed", undefined)).toBe("fetch failed");
    });
  });
});

describe("generateUsernameSlug", () => {
  it("keeps the suggested username inside Telegram's limits", () => {
    const username = suggestBotUsername();
    expect(username.length).toBeLessThanOrEqual(32);
    expect(username).toMatch(/^jait_[a-z2-7]{16}_bot$/);
  });

  it("does not repeat itself", () => {
    const slugs = new Set(Array.from({ length: 50 }, () => generateUsernameSlug()));
    expect(slugs.size).toBe(50);
  });
});
