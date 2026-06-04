import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { WhatsAppConnector, extractText, bareJid, type WASocketLike } from "./connector.js";
import type { ChannelStatus, InboundMessage } from "../types.js";

describe("extractText", () => {
  it("reads plain, extended, caption and wrapped messages", () => {
    expect(extractText({ conversation: "hi" })).toBe("hi");
    expect(extractText({ extendedTextMessage: { text: "yo" } })).toBe("yo");
    expect(extractText({ imageMessage: { caption: "pic" } })).toBe("pic");
    expect(extractText({ ephemeralMessage: { message: { conversation: "secret" } } })).toBe("secret");
    expect(extractText({})).toBe("");
    expect(extractText(null)).toBe("");
  });
});

describe("bareJid", () => {
  it("strips device + domain", () => {
    expect(bareJid("491701234567:5@s.whatsapp.net")).toBe("491701234567");
    expect(bareJid(null)).toBe("");
  });
});

/* Fake baileys socket driven via an EventEmitter. */
function makeFakeSocket() {
  const ev = new EventEmitter();
  const sent: { jid: string; text: string }[] = [];
  const sock: WASocketLike = {
    ev: { on: (event, listener) => { ev.on(event, listener); } },
    sendMessage: async (jid, content) => { sent.push({ jid, text: content.text }); return {}; },
    user: { id: "491701234567:5@s.whatsapp.net" },
    end: () => {},
  };
  return { ev, sock, sent };
}

describe("WhatsAppConnector", () => {
  it("emits a QR data-url on connection.update", async () => {
    const { ev, sock } = makeFakeSocket();
    const statuses: { status: ChannelStatus; qr?: string }[] = [];
    const connector = new WhatsAppConnector({
      makeSocket: () => sock,
      loadAuthState: async () => ({ state: {}, saveCreds: async () => {} }),
      encodeQr: async (text) => `data:image/png;base64,${Buffer.from(text).toString("base64")}`,
    });

    await connector.start({
      onInbound: () => {},
      onStatus: (status, detail) => statuses.push({ status, qr: detail?.qr }),
    });

    ev.emit("connection.update", { qr: "QR-CHALLENGE" });
    await new Promise((r) => setTimeout(r, 5));

    expect(connector.status()).toBe("qr");
    expect(connector.currentQr()).toContain("data:image/png;base64,");
    expect(statuses.some((s) => s.status === "qr")).toBe(true);
  });

  it("marks connected and routes inbound text to onInbound", async () => {
    const { ev, sock } = makeFakeSocket();
    const inbound: InboundMessage[] = [];
    const connector = new WhatsAppConnector({
      makeSocket: () => sock,
      loadAuthState: async () => ({ state: {}, saveCreds: async () => {} }),
      encodeQr: async () => "data:image/png;base64,xxx",
    });

    await connector.start({ onInbound: (m) => inbound.push(m), onStatus: () => {} });
    ev.emit("connection.update", { connection: "open" });
    expect(connector.status()).toBe("connected");

    ev.emit("messages.upsert", {
      type: "notify",
      messages: [{
        key: { remoteJid: "999@s.whatsapp.net", fromMe: false, participant: "999@s.whatsapp.net" },
        pushName: "Bob",
        message: { conversation: "hey bot" },
        messageTimestamp: 1700000000,
      }],
    });

    expect(inbound).toHaveLength(1);
    expect(inbound[0]).toMatchObject({ text: "hey bot", senderName: "Bob", conversationId: "999@s.whatsapp.net", fromMe: false });
  });

  it("flags self-chat when the conversation is the linked account", async () => {
    const { ev, sock } = makeFakeSocket();
    const inbound: InboundMessage[] = [];
    const connector = new WhatsAppConnector({
      makeSocket: () => sock,
      loadAuthState: async () => ({ state: {}, saveCreds: async () => {} }),
      encodeQr: async () => "x",
    });
    await connector.start({ onInbound: (m) => inbound.push(m), onStatus: () => {} });
    ev.emit("connection.update", { connection: "open" }); // sets selfBare = 491701234567

    ev.emit("messages.upsert", {
      type: "notify",
      messages: [{
        key: { remoteJid: "491701234567@s.whatsapp.net", fromMe: true },
        message: { conversation: "note to self" },
        messageTimestamp: 1700000000,
      }],
    });

    expect(inbound[0]?.isSelfChat).toBe(true);
  });

  it("sends via the socket", async () => {
    const { sock, sent } = makeFakeSocket();
    const connector = new WhatsAppConnector({
      makeSocket: () => sock,
      loadAuthState: async () => ({ state: {}, saveCreds: async () => {} }),
      encodeQr: async () => "x",
    });
    await connector.start({ onInbound: () => {}, onStatus: () => {} });
    await connector.send({ conversationId: "999@s.whatsapp.net", text: "hello" });
    expect(sent).toEqual([{ jid: "999@s.whatsapp.net", text: "hello" }]);
  });

  it("ignores non-text and status broadcasts", async () => {
    const { ev, sock } = makeFakeSocket();
    const inbound: InboundMessage[] = [];
    const connector = new WhatsAppConnector({
      makeSocket: () => sock,
      loadAuthState: async () => ({ state: {}, saveCreds: async () => {} }),
      encodeQr: async () => "x",
    });
    await connector.start({ onInbound: (m) => inbound.push(m), onStatus: () => {} });
    ev.emit("messages.upsert", { type: "notify", messages: [
      { key: { remoteJid: "status@broadcast" }, message: { conversation: "ad" }, messageTimestamp: 1 },
      { key: { remoteJid: "999@s.whatsapp.net" }, message: {}, messageTimestamp: 1 },
    ]});
    expect(inbound).toHaveLength(0);
  });
});
