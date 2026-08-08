import { describe, expect, it, beforeEach } from "vitest";
import { openRawSqlite } from "../db/sqlite-shim.js";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import {
  ChannelManager,
  buildCliPrompt,
  formatNotification,
  groupModelsByProvider,
  normalizeSenderId,
  parseCommand,
  shouldRespond,
  type ReplyGenerator,
} from "./manager.js";
import type {
  ChannelConfig,
  ChannelConnector,
  ChannelConnectorEvents,
  ChannelStatus,
  InboundMessage,
  OutboundMessage,
} from "./types.js";
import type { AgentMessage, LLMConfig } from "../tools/agent-loop.js";
import { ConsentManager } from "../security/consent-manager.js";

/* A fake connector that lets the test drive inbound messages and capture sends. */
class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}

const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};

const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;

function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}

describe("shouldRespond", () => {
  it("ignores our own messages to other people", () => {
    expect(shouldRespond(
      { fromMe: true, isSelfChat: false } as InboundMessage,
      {},
    )).toBe(false);
  });

  it("defaults to self-chat only when no allowlist", () => {
    expect(shouldRespond({ fromMe: false, isSelfChat: true, senderId: "1" } as InboundMessage, {})).toBe(true);
    expect(shouldRespond({ fromMe: false, isSelfChat: false, senderId: "1" } as InboundMessage, {})).toBe(false);
  });

  it("honors an allowlist by bare number", () => {
    const cfg = { allowedSenders: ["+49 170 1234567"] };
    expect(shouldRespond({ fromMe: false, isSelfChat: false, senderId: "491701234567@s.whatsapp.net" } as InboundMessage, cfg)).toBe(true);
    expect(shouldRespond({ fromMe: false, isSelfChat: false, senderId: "999@s.whatsapp.net" } as InboundMessage, cfg)).toBe(false);
  });

  it("always answers the self-chat even when an allowlist excludes its sender", () => {
    // Regression: LID-addressed self-chat carries an empty/aliased senderId, so
    // it never matches the allowlist — but the self-chat must still be answered.
    const cfg = { allowedSenders: ["+436645336765"], respondToAll: false };
    expect(shouldRespond({ fromMe: true, isSelfChat: true, senderId: "" } as InboundMessage, cfg)).toBe(true);
  });

  it("respondToAll answers anyone (but not our outgoing)", () => {
    const cfg = { respondToAll: true };
    expect(shouldRespond({ fromMe: false, isSelfChat: false, senderId: "x" } as InboundMessage, cfg)).toBe(true);
    expect(shouldRespond({ fromMe: true, isSelfChat: false, senderId: "x" } as InboundMessage, cfg)).toBe(false);
  });
});

describe("normalizeSenderId", () => {
  it("strips suffixes and non-digits", () => {
    expect(normalizeSenderId("491701234567:5@s.whatsapp.net")).toBe("491701234567");
    expect(normalizeSenderId("+49 170 1234567")).toBe("491701234567");
  });
});

describe("ChannelManager pipeline", () => {
  let sqlite: SqliteDatabase;
  beforeEach(async () => { sqlite = await openRawSqlite(":memory:"); });

  it("persists and reads config", () => {
    const { mgr } = makeManager(sqlite);
    mgr.setConfig("fake", { allowedSenders: ["123"], enabled: true });
    expect(mgr.getConfig("fake")).toMatchObject({ allowedSenders: ["123"], enabled: true });
  });

  it("replies to a self-chat message and sends via the connector", async () => {
    const { mgr, connector } = makeManager(sqlite);
    await mgr.start("fake");
    connector.emit({ text: "hello there", isSelfChat: true });
    // allow the async pipeline to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(connector.sent).toHaveLength(1);
    expect(connector.sent[0]?.text).toBe("echo: hello there");
  });

  it("does NOT reply to a stranger without an allowlist", async () => {
    const { mgr, connector } = makeManager(sqlite);
    await mgr.start("fake");
    connector.emit({ text: "spam", isSelfChat: false, senderId: "999@s.whatsapp.net" });
    await new Promise((r) => setTimeout(r, 10));
    expect(connector.sent).toHaveLength(0);
  });

  it("start persists enabled and list reflects status", async () => {
    const { mgr } = makeManager(sqlite);
    await mgr.start("fake");
    const list = mgr.list();
    expect(list[0]).toMatchObject({ id: "fake", status: "connected", enabled: true });
  });

  it("hands the persisted config to the connector on start", async () => {
    const { mgr, connector } = makeManager(sqlite);
    mgr.setConfig("fake", { token: "bot-token", allowedSenders: ["123"] });
    await mgr.start("fake");
    expect(connector.startConfig).toMatchObject({ token: "bot-token", allowedSenders: ["123"] });
  });
});

describe("ChannelManager pairing", () => {
  let sqlite: SqliteDatabase;
  beforeEach(async () => { sqlite = await openRawSqlite(":memory:"); });

  it("allowlists a paired sender so the agent replies to them", async () => {
    const { mgr, connector } = makeManager(sqlite);
    await mgr.start("fake");

    connector.events?.onPaired?.({ senderId: "4242", senderName: "@lukas", conversationId: "4242" });
    expect(mgr.getConfig("fake").allowedSenders).toEqual(["4242"]);

    connector.emit({ text: "hi", senderId: "4242", conversationId: "4242" });
    await new Promise((r) => setTimeout(r, 10));
    expect(connector.sent).toHaveLength(1);
    expect(connector.sent[0]?.text).toBe("echo: hi");
  });

  it("keeps existing senders and ignores a repeated pairing", async () => {
    const { mgr, connector } = makeManager(sqlite);
    mgr.setConfig("fake", { allowedSenders: ["111"] });
    await mgr.start("fake");

    connector.events?.onPaired?.({ senderId: "4242", conversationId: "4242" });
    connector.events?.onPaired?.({ senderId: "4242", conversationId: "4242" });

    expect(mgr.getConfig("fake").allowedSenders).toEqual(["111", "4242"]);
  });

  it("rejects re-pairing on connectors that do not support it", async () => {
    const { mgr } = makeManager(sqlite);
    await mgr.start("fake");
    await expect(mgr.pair("fake")).rejects.toThrow(/does not support re-pairing/);
  });
});

describe("ChannelManager in-band consent", () => {
  let sqlite: SqliteDatabase;
  beforeEach(async () => { sqlite = await openRawSqlite(":memory:"); });

  /** Wire a real ConsentManager bridged to the channel manager, plus a generator
   *  that simulates an agent turn requesting approval for a mutating tool. */
  function makeConsentManager(timeoutMs = 1000) {
    let mgr: ChannelManager;
    const consent = new ConsentManager({
      defaultTimeoutMs: timeoutMs,
      onRequest: (r) => mgr.handleConsentRequest(r),
      onDecision: (d) => mgr.handleConsentDecision(d),
    });
    const generator: ReplyGenerator = {
      async generate(_history, ctx) {
        const decision = await consent.requestConsent({
          actionId: "a1",
          toolName: "execute",
          summary: "Run execute",
          preview: { command: "rm -rf build" },
          risk: "high",
          policy: { consentLevel: "always", description: "x", knownTool: true, source: "profile" },
          sessionId: ctx.sessionId,
          timeoutMs,
        });
        return decision.approved ? "done: ran it" : "skipped: not run";
      },
    };
    mgr = new ChannelManager({ sqlite, consentManager: consent, resolveLLM: () => fakeLLM, replyGenerator: generator });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, consent };
  }

  it("prompts for approval and runs the tool after a 'yes' reply", async () => {
    const { mgr, connector } = makeConsentManager();
    await mgr.start("fake");
    connector.emit({ text: "delete the build dir", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 10));
    // First outbound is the approval prompt; the turn is now blocked awaiting it.
    expect(connector.sent).toHaveLength(1);
    expect(connector.sent[0]?.text).toContain("execute");
    expect(connector.sent[0]?.text.toLowerCase()).toContain("yes");

    connector.emit({ text: "yes", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 10));
    // The "yes" resolved consent; the turn finished and sent its result.
    expect(connector.sent.map((m) => m.text)).toContain("done: ran it");
  });

  it("skips the tool after a 'no' reply", async () => {
    const { connector, mgr } = makeConsentManager();
    await mgr.start("fake");
    connector.emit({ text: "delete the build dir", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 10));
    connector.emit({ text: "no", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 10));
    expect(connector.sent.map((m) => m.text)).toContain("skipped: not run");
  });

  it("re-prompts on an ambiguous reply without resolving", async () => {
    const { connector, mgr } = makeConsentManager();
    await mgr.start("fake");
    connector.emit({ text: "delete the build dir", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 10));
    connector.emit({ text: "maybe later, what do you think?", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 10));
    // Still only the original prompt + the re-prompt; no result yet.
    expect(connector.sent.some((m) => m.text.includes("yes") && m.text.includes("no"))).toBe(true);
    expect(connector.sent.map((m) => m.text)).not.toContain("done: ran it");
    expect(connector.sent.map((m) => m.text)).not.toContain("skipped: not run");
  });

  it("auto-denies and notifies on timeout", async () => {
    const { connector, mgr } = makeConsentManager(60);
    await mgr.start("fake");
    connector.emit({ text: "delete the build dir", isSelfChat: true });
    // Wait past the 60ms approval window without replying.
    await new Promise((r) => setTimeout(r, 150));
    expect(connector.sent.map((m) => m.text)).toContain("⌛ No reply — skipped that action.");
    expect(connector.sent.map((m) => m.text)).toContain("skipped: not run");
  });
});

describe("parseCommand", () => {
  it("recognises the supported commands", () => {
    expect(parseCommand("/help")).toEqual({ command: "help", args: "" });
    expect(parseCommand("  /status  ")).toEqual({ command: "status", args: "" });
    expect(parseCommand("/model 3")).toEqual({ command: "model", args: "3" });
    expect(parseCommand("/notifications on")).toEqual({ command: "notifications", args: "on" });
  });

  it("strips the @botname suffix Telegram adds in groups", () => {
    expect(parseCommand("/model@jait_bot gpt-4o")).toEqual({ command: "model", args: "gpt-4o" });
  });

  it("ignores ordinary messages and unknown commands", () => {
    expect(parseCommand("what model are you?")).toBeNull();
    expect(parseCommand("/deploy production")).toBeNull();
    expect(parseCommand("/start CODE")).toBeNull();
  });
});

describe("formatNotification", () => {
  it("renders level, title and body", () => {
    expect(formatNotification({ title: "Build failed", body: "3 tests red", level: "error" }))
      .toBe("🚨 Build failed\n\n3 tests red");
  });

  it("keeps absolute links but drops in-app paths", () => {
    expect(formatNotification({ title: "T", body: "B", link: "https://jait.example/plans/1" }))
      .toContain("https://jait.example/plans/1");
    expect(formatNotification({ title: "T", body: "B", link: "/plans/1" })).not.toContain("/plans/1");
  });
});

describe("ChannelManager notifications", () => {
  let sqlite: SqliteDatabase;
  beforeEach(async () => { sqlite = await openRawSqlite(":memory:"); });

  it("delivers to the allowed senders once enabled", async () => {
    const { mgr, connector } = makeManager(sqlite);
    mgr.setConfig("fake", { notifications: true, allowedSenders: ["111", "222"] });
    await mgr.start("fake");

    const delivered = await mgr.notify({ title: "Routine done", body: "Nightly sync finished" });

    expect(delivered).toBe(2);
    expect(connector.sent.map((m) => m.conversationId)).toEqual(["111", "222"]);
    expect(connector.sent[0]!.text).toContain("Routine done");
  });

  it("stays silent when the channel has not opted in", async () => {
    const { mgr, connector } = makeManager(sqlite);
    mgr.setConfig("fake", { allowedSenders: ["111"] });
    await mgr.start("fake");

    expect(await mgr.notify({ title: "T", body: "B" })).toBe(0);
    expect(connector.sent).toHaveLength(0);
  });

  it("does not notify a disconnected channel", async () => {
    const { mgr, connector } = makeManager(sqlite);
    mgr.setConfig("fake", { notifications: true, allowedSenders: ["111"] });

    expect(await mgr.notify({ title: "T", body: "B" })).toBe(0);
    expect(connector.sent).toHaveLength(0);
  });

  it("never broadcasts to unknown senders just because respondToAll is on", async () => {
    const { mgr, connector } = makeManager(sqlite);
    mgr.setConfig("fake", { notifications: true, respondToAll: true, allowedSenders: [] });
    await mgr.start("fake");

    expect(await mgr.notify({ title: "T", body: "B" })).toBe(0);
    expect(connector.sent).toHaveLength(0);
  });
});

describe("ChannelManager commands", () => {
  let sqlite: SqliteDatabase;
  beforeEach(async () => { sqlite = await openRawSqlite(":memory:"); });

  /** Manager with a model catalogue, so /model has something to offer. */
  function makeCommandManager(db: SqliteDatabase) {
    const models = [
      { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
      { id: "llama3", label: "Llama 3", group: "Ollama" },
    ];
    const seen: (string | undefined)[] = [];
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: {
        async generate(_history, ctx) { seen.push(ctx.model); return "reply"; },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, seen };
  }

  const lastText = (connector: FakeConnector) => connector.sent.at(-1)?.text ?? "";

  it("lists the catalogue on a bare /model", async () => {
    const { mgr, connector } = makeCommandManager(sqlite);
    await mgr.start("fake");

    connector.emit({ text: "/model", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));

    expect(lastText(connector)).toContain("1. GPT-4o");
    expect(lastText(connector)).toContain("2. Llama 3");
  });

  it("switches by number and applies the model to the next turn", async () => {
    const { mgr, connector, seen } = makeCommandManager(sqlite);
    await mgr.start("fake");

    connector.emit({ text: "/model 2", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(mgr.getConfig("fake").model).toBe("llama3");

    connector.emit({ text: "hello", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toEqual(["llama3"]);
  });

  it("switches by id and resets back to the default", async () => {
    const { mgr, connector } = makeCommandManager(sqlite);
    await mgr.start("fake");

    connector.emit({ text: "/model gpt-4o", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(mgr.getConfig("fake").model).toBe("gpt-4o");

    connector.emit({ text: "/model reset", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(mgr.getConfig("fake").model).toBe("");
  });

  it("rejects a model that is not in the catalogue", async () => {
    const { mgr, connector } = makeCommandManager(sqlite);
    await mgr.start("fake");

    connector.emit({ text: "/model nonsense-9000", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));

    expect(lastText(connector)).toContain("Unknown model");
    expect(mgr.getConfig("fake").model).toBeUndefined();
  });

  it("toggles notifications from the chat", async () => {
    const { mgr, connector } = makeCommandManager(sqlite);
    await mgr.start("fake");

    connector.emit({ text: "/notifications on", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(mgr.getConfig("fake").notifications).toBe(true);

    connector.emit({ text: "/notifications off", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(mgr.getConfig("fake").notifications).toBe(false);
  });

  it("never sends a command to the agent", async () => {
    const { mgr, connector, seen } = makeCommandManager(sqlite);
    await mgr.start("fake");

    connector.emit({ text: "/help", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));

    expect(seen).toHaveLength(0);
    expect(lastText(connector)).toContain("/model");
  });
});

describe("ChannelManager command menu", () => {
  let sqlite: SqliteDatabase;
  beforeEach(async () => { sqlite = await openRawSqlite(":memory:"); });

  it("publishes every supported command to the connector on start", async () => {
    const { mgr, connector } = makeManager(sqlite);
    await mgr.start("fake");

    expect(connector.menu?.map((c) => c.name)).toEqual(["model", "notifications", "approvals", "status", "help"]);
    for (const entry of connector.menu ?? []) {
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("keeps the channel up when publishing the menu fails", async () => {
    const { mgr, connector } = makeManager(sqlite);
    connector.setCommandMenu = async () => { throw new Error("Telegram said no"); };

    await expect(mgr.start("fake")).resolves.toBeUndefined();
    expect(mgr.list()[0]).toMatchObject({ status: "connected" });
  });

  it("matches the commands the dispatcher accepts", async () => {
    const { mgr, connector } = makeManager(sqlite);
    await mgr.start("fake");

    for (const entry of connector.menu ?? []) {
      expect(parseCommand(`/${entry.name}`)).toMatchObject({ command: entry.name });
    }
  });
});

describe("/model dialog", () => {
  let sqlite: SqliteDatabase;
  beforeEach(async () => { sqlite = await openRawSqlite(":memory:"); });

  const models = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, label: `Model ${i}`, group: "OpenAI" }));

  function makeDialogManager(db: SqliteDatabase, supportsChoices: boolean) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: supportsChoices });
    mgr.register(connector);
    return { mgr, connector };
  }

  it("offers tappable options on a channel that renders dialogs", async () => {
    const { mgr, connector } = makeDialogManager(sqlite, true);
    mgr.setConfig("fake", { model: "m1" });
    await mgr.start("fake");

    connector.emit({ text: "/model", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));

    const sent = connector.sent.at(-1)!;
    expect(sent.text).not.toContain("1. Model 0");
    expect(sent.choices?.length).toBe(25); // 24 models + reset
    expect(sent.choices?.[1]).toEqual({ label: "✅ Model 1 (OpenAI)", value: "/model m1" });
    expect(sent.choices?.at(-1)).toEqual({ label: "↩️ Gateway default", value: "/model reset" });
    expect(sent.text).toContain("6 more available");
  });

  it("falls back to the numbered list where dialogs are not supported", async () => {
    const { mgr, connector } = makeDialogManager(sqlite, false);
    await mgr.start("fake");

    connector.emit({ text: "/model", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));

    const sent = connector.sent.at(-1)!;
    expect(sent.choices).toBeUndefined();
    expect(sent.text).toContain("1. Model 0");
  });

  it("applies the choice when its value comes back as a message", async () => {
    const { mgr, connector } = makeDialogManager(sqlite, true);
    await mgr.start("fake");

    connector.emit({ text: "/model", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    const choice = connector.sent.at(-1)!.choices![3]!;

    // A tapped button re-enters through the same path as a typed command.
    connector.emit({ text: choice.value, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));

    expect(mgr.getConfig("fake").model).toBe("m3");
    expect(connector.sent.at(-1)!.text).toContain("Now using Model 3");
  });
});

/** Choice labels without the navigation entries (back / reset / all). */
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}

describe("/model provider selection", () => {
  let sqlite: SqliteDatabase;
  beforeEach(async () => { sqlite = await openRawSqlite(":memory:"); });

  const mixed = [
    { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    { id: "gpt-5", label: "GPT-5", group: "OpenAI" },
    { id: "anthropic/claude", label: "Claude", group: "OpenRouter" },
    { id: "llama3", label: "Llama 3", group: "Ollama" },
  ];

  function makeMixedManager(db: SqliteDatabase, supportsChoices: boolean, models = mixed) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: supportsChoices });
    mgr.register(connector);
    return { mgr, connector };
  }

  const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };

  it("asks for the provider first when several are configured", async () => {
    const { mgr, connector } = makeMixedManager(sqlite, true);
    await mgr.start("fake");

    const sent = await send(connector, "/model");

    expect(sent.text).toContain("Pick a provider");
    expect(sent.choices?.map((c) => c.label)).toEqual([
      "OpenAI (2)", "Ollama (1)", "OpenRouter (1)", "All models (4)",
    ]);
    expect(sent.choices?.[0]!.value).toBe("/model provider OpenAI");
  });

  it("lists that provider's models after the first step", async () => {
    const { mgr, connector } = makeMixedManager(sqlite, true);
    await mgr.start("fake");

    const sent = await send(connector, "/model provider OpenAI");

    expect(sent.text).toContain("OpenAI —");
    expect(modelLabels(sent)).toEqual(["GPT-4o (OpenAI)", "GPT-5 (OpenAI)"]);
  });

  it("offers everything on /model provider all", async () => {
    const { mgr, connector } = makeMixedManager(sqlite, true);
    await mgr.start("fake");

    const sent = await send(connector, "/model provider all");

    expect(modelLabels(sent)).toEqual([
      "GPT-4o (OpenAI)", "GPT-5 (OpenAI)", "Claude (OpenRouter)", "Llama 3 (Ollama)",
    ]);
  });

  it("skips the provider step when only one provider exists", async () => {
    const { mgr, connector } = makeMixedManager(sqlite, true, [mixed[0]!, mixed[1]!]);
    await mgr.start("fake");

    const sent = await send(connector, "/model");

    expect(sent.text).not.toContain("Pick a provider");
    expect(modelLabels(sent)).toEqual(["GPT-4o (OpenAI)", "GPT-5 (OpenAI)"]);
  });

  it("names the provider in the numbered list and on confirmation", async () => {
    const { mgr, connector } = makeMixedManager(sqlite, false);
    await mgr.start("fake");

    const listed = await send(connector, "/model");
    expect(listed.text).toContain("3. Claude (OpenRouter)");

    const confirmed = await send(connector, "/model llama3");
    expect(confirmed.text).toBe("✅ Now using Llama 3 (Ollama) on this channel.");
  });

  it("reports an unknown provider instead of an empty list", async () => {
    const { mgr, connector } = makeMixedManager(sqlite, true);
    await mgr.start("fake");

    const sent = await send(connector, "/model provider Anthropic");

    expect(sent.text).toContain('No models from "Anthropic"');
    expect(sent.choices).toBeUndefined();
  });
});

describe("groupModelsByProvider", () => {
  it("counts per provider, biggest first", () => {
    expect(groupModelsByProvider([
      { id: "a", group: "Ollama" },
      { id: "b", group: "OpenAI" },
      { id: "c", group: "OpenAI" },
      { id: "d" },
    ])).toEqual([{ group: "OpenAI", count: 2 }, { group: "Ollama", count: 1 }]);
  });
});

describe("/model back navigation", () => {
  let sqlite: SqliteDatabase;
  beforeEach(async () => { sqlite = await openRawSqlite(":memory:"); });

  const models = [
    { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    { id: "llama3", label: "Llama 3", group: "Ollama" },
  ];

  function makeManager2(db: SqliteDatabase) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    return { mgr, connector };
  }

  const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };

  it("offers a way back from the model list to the providers", async () => {
    const { mgr, connector } = makeManager2(sqlite);
    await mgr.start("fake");

    const step2 = await send(connector, "/model provider OpenAI");
    const back = step2.choices?.find((c) => c.label.includes("Back"));
    expect(back?.value).toBe("/model");

    // Following it lands on the provider step again.
    const step1 = await send(connector, back!.value);
    expect(step1.text).toContain("Pick a provider");
  });

  it("shows no back option on the first step", async () => {
    const { mgr, connector } = makeManager2(sqlite);
    await mgr.start("fake");

    const step1 = await send(connector, "/model");

    expect(step1.choices?.some((c) => c.label.includes("Back"))).toBe(false);
  });
});

describe("buildCliPrompt", () => {
  it("passes a single message through unchanged", () => {
    expect(buildCliPrompt([
      { role: "system", content: "ignored" },
      { role: "user", content: "list the failing tests" },
    ] as AgentMessage[])).toBe("list the failing tests");
  });

  it("carries earlier turns, since each CLI session starts fresh", () => {
    const prompt = buildCliPrompt([
      { role: "user", content: "what is in src?" },
      { role: "assistant", content: "Three files." },
      { role: "user", content: "and the biggest one?" },
    ] as AgentMessage[]);

    expect(prompt).toBe(
      "Earlier in this chat:\nUser: what is in src?\nAssistant: Three files.\n\nUser: and the biggest one?",
    );
  });

  it("keeps only the most recent turns", () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ role: "user", content: `m${i}` }));
    const prompt = buildCliPrompt(history as AgentMessage[], 4);

    expect(prompt).toContain("m19");
    expect(prompt).not.toContain("m15");
  });
});

describe("CLI provider models", () => {
  let sqlite: SqliteDatabase;
  beforeEach(async () => { sqlite = await openRawSqlite(":memory:"); });

  const models = [
    { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    { id: "opus", label: "Opus", group: "Claude Code", provider: "claude-code-1" },
  ];

  function makeManager3(db: SqliteDatabase) {
    const seen: Array<{ model?: string; modelProvider?: string }> = [];
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: {
        async generate(_history, ctx) {
          seen.push({ model: ctx.model, modelProvider: ctx.modelProvider });
          return "reply";
        },
      },
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    return { mgr, connector, seen };
  }

  const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };

  it("offers CLI providers alongside the API backends", async () => {
    const { mgr, connector } = makeManager3(sqlite);
    await mgr.start("fake");

    const sent = await send(connector, "/model");

    expect(sent.choices?.map((c) => c.label)).toContain("Claude Code (1)");
  });

  it("stores the provider with the model and routes the next turn to it", async () => {
    const { mgr, connector, seen } = makeManager3(sqlite);
    await mgr.start("fake");

    const confirmation = await send(connector, "/model opus");
    expect(mgr.getConfig("fake")).toMatchObject({ model: "opus", modelProvider: "claude-code-1" });
    expect(confirmation.text).toContain("supervised CLI session");

    await send(connector, "hello");
    expect(seen.at(-1)).toEqual({ model: "opus", modelProvider: "claude-code-1" });
  });

  it("clears the provider when switching back to an API model", async () => {
    const { mgr, connector, seen } = makeManager3(sqlite);
    await mgr.start("fake");

    await send(connector, "/model opus");
    await send(connector, "/model gpt-4o");
    expect(mgr.getConfig("fake").modelProvider).toBe("");

    await send(connector, "hello");
    expect(seen.at(-1)).toEqual({ model: "gpt-4o", modelProvider: undefined });
  });

  it("clears the provider on reset", async () => {
    const { mgr, connector } = makeManager3(sqlite);
    await mgr.start("fake");

    await send(connector, "/model opus");
    await send(connector, "/model reset");

    expect(mgr.getConfig("fake")).toMatchObject({ model: "", modelProvider: "" });
  });
});

describe("model catalogue caching", () => {
  let sqlite: SqliteDatabase;
  beforeEach(async () => { sqlite = await openRawSqlite(":memory:"); });

  function makeCountingManager(db: SqliteDatabase, models = [{ id: "m1", label: "M1", group: "OpenAI" }]) {
    let calls = 0;
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => { calls += 1; return models; },
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    return { mgr, connector, calls: () => calls };
  }

  const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
  };

  it("resolves the catalogue once while walking the picker", async () => {
    const { mgr, connector, calls } = makeCountingManager(sqlite, [
      { id: "m1", label: "M1", group: "OpenAI" },
      { id: "m2", label: "M2", group: "Ollama" },
    ]);
    await mgr.start("fake");

    await send(connector, "/model");
    await send(connector, "/model provider OpenAI");
    await send(connector, "/model");
    await send(connector, "/model m1");

    expect(calls()).toBe(1);
  });

  it("does not cache an empty catalogue", async () => {
    const { mgr, connector, calls } = makeCountingManager(sqlite, []);
    await mgr.start("fake");

    await send(connector, "/model");
    await send(connector, "/model");

    expect(calls()).toBe(2);
  });
});

describe('/model "default" is a real model id', () => {
  let sqlite: SqliteDatabase;
  beforeEach(async () => { sqlite = await openRawSqlite(":memory:"); });

  function makeManager4(db: SqliteDatabase, models: { id: string; label?: string; group?: string; provider?: string }[]) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    return { mgr, connector };
  }

  const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };

  it("selects Claude Code's default instead of falling back", async () => {
    const { mgr, connector } = makeManager4(sqlite, [
      { id: "default", label: "Default", group: "Claude Code", provider: "claude-code-1" },
      { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    ]);
    await mgr.start("fake");

    const sent = await send(connector, "/model default");

    expect(mgr.getConfig("fake")).toMatchObject({ model: "default", modelProvider: "claude-code-1" });
    expect(sent.text).toContain("Now using Default (Claude Code)");
  });

  it("still resets when no model is called default", async () => {
    const { mgr, connector } = makeManager4(sqlite, [{ id: "gpt-4o", label: "GPT-4o", group: "OpenAI" }]);
    await mgr.start("fake");
    await send(connector, "/model gpt-4o");

    const sent = await send(connector, "/model default");

    expect(mgr.getConfig("fake")).toMatchObject({ model: "", modelProvider: "" });
    expect(sent.text).toContain("Back to the gateway default");
  });

  it("keeps reset reserved even against a model of that name", async () => {
    const { mgr, connector } = makeManager4(sqlite, [
      { id: "reset", label: "Reset", group: "Odd" },
      { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    ]);
    await mgr.start("fake");
    await send(connector, "/model gpt-4o");

    await send(connector, "/model reset");

    expect(mgr.getConfig("fake")).toMatchObject({ model: "", modelProvider: "" });
  });
});

describe("catalogue warm-up", () => {
  let sqlite: SqliteDatabase;
  beforeEach(async () => { sqlite = await openRawSqlite(":memory:"); });

  it("resolves ahead of the first /model so the chat doesn't wait", async () => {
    let calls = 0;
    const mgr = new ChannelManager({
      sqlite,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => { calls += 1; return [{ id: "m1", label: "M1", group: "OpenAI" }]; },
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    await mgr.start("fake");

    mgr.warmModelCatalogue();
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toBe(1);

    connector.emit({ text: "/model", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));

    // Served from the warmed cache, not a second resolution.
    expect(calls).toBe(1);
    expect(connector.sent.at(-1)!.choices?.length).toBeGreaterThan(0);
  });

  it("survives a failing warm-up", async () => {
    const mgr = new ChannelManager({
      sqlite,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => { throw new Error("provider down"); },
      replyGenerator: echoGenerator,
      log: () => {},
    });
    mgr.register(new FakeConnector());

    expect(() => mgr.warmModelCatalogue()).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
  });
});

describe("catalogue invalidation", () => {
  let sqlite: SqliteDatabase;
  beforeEach(async () => { sqlite = await openRawSqlite(":memory:"); });

  it("re-resolves after a late provider invalidates the cache", async () => {
    let calls = 0;
    const mgr = new ChannelManager({
      sqlite,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => { calls += 1; return [{ id: `m${calls}`, label: `M${calls}`, group: "OpenAI" }]; },
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    await mgr.start("fake");

    connector.emit({ text: "/model", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBe(1);

    // A provider that missed its budget has answered — the partial list is stale.
    mgr.invalidateModelCache();

    connector.emit({ text: "/model", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBe(2);
  });
});

describe("tool approvals", () => {
  let sqlite: SqliteDatabase;
  beforeEach(async () => { sqlite = await openRawSqlite(":memory:"); });

  function makeApprovalManager(db: SqliteDatabase) {
    const consentManager = new ConsentManager({ db, timeoutMs: 1000 });
    const seen: Array<boolean | undefined> = [];
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      consentManager,
      replyGenerator: {
        async generate(_history, ctx) { seen.push(ctx.autoApprove); return "reply"; },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, consentManager, seen };
  }

  const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };

  it("lets the agent decide by default", async () => {
    const { mgr, connector, consentManager, seen } = makeApprovalManager(sqlite);
    await mgr.start("fake");

    await send(connector, "do something");

    expect(seen).toEqual([true]);
    expect(consentManager.isApproveAllEnabledForSession("channel:fake:chat-1")).toBe(true);
  });

  it("asks each time once switched to ask", async () => {
    const { mgr, connector, consentManager, seen } = makeApprovalManager(sqlite);
    await mgr.start("fake");

    await send(connector, "/approvals ask");
    expect(mgr.getConfig("fake").autoApprove).toBe(false);

    await send(connector, "do something");
    expect(seen).toEqual([false]);
    expect(consentManager.isApproveAllEnabledForSession("channel:fake:chat-1")).toBe(false);
  });

  it("switches back to automatic", async () => {
    const { mgr, connector, consentManager } = makeApprovalManager(sqlite);
    await mgr.start("fake");

    await send(connector, "/approvals ask");
    await send(connector, "do something");
    const confirmation = await send(connector, "/approvals auto");

    expect(mgr.getConfig("fake").autoApprove).toBe(true);
    expect(confirmation.text).toContain("Irreversible commands still ask");

    await send(connector, "do something else");
    expect(consentManager.isApproveAllEnabledForSession("channel:fake:chat-1")).toBe(true);
  });

  it("reports the current mode on a bare /approvals and in /status", async () => {
    const { mgr, connector } = makeApprovalManager(sqlite);
    await mgr.start("fake");

    expect((await send(connector, "/approvals")).text).toContain("run automatically");
    expect((await send(connector, "/status")).text).toContain("Tool approvals: automatic");
  });
});
