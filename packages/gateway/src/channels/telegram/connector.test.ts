import { describe, expect, it } from "vitest";
import { TelegramConnector, telegramMessageToInbound } from "./connector.js";
import type { ChannelStatus } from "../types.js";

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

    expect(statuses).toMatchObject([{ status: "error", error: "TELEGRAM_BOT_TOKEN is required" }]);
  });
});
