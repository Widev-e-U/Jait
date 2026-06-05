import { describe, expect, it, beforeEach } from "vitest";
import { openRawSqlite } from "../db/sqlite-shim.js";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import { ChannelManager, shouldRespond, normalizeSenderId, type ReplyGenerator } from "./manager.js";
import type {
  ChannelConnector,
  ChannelConnectorEvents,
  ChannelStatus,
  InboundMessage,
  OutboundMessage,
} from "./types.js";
import type { LLMConfig } from "../tools/agent-loop.js";
import { ConsentManager } from "../security/consent-manager.js";

/* A fake connector that lets the test drive inbound messages and capture sends. */
class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  async start(events: ChannelConnectorEvents) { this.events = events; this._status = "connected"; events.onStatus("connected"); }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }
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
