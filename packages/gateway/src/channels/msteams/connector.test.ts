import { afterEach, describe, expect, it } from "vitest";
import {
  MSTeamsConnector,
  isAllowedMSTeamsServiceUrl,
  msteamsActivityToInbound,
} from "./connector.js";
import type { InboundMessage } from "../types.js";

const connectors: MSTeamsConnector[] = [];

afterEach(async () => {
  await Promise.all(connectors.map((connector) => connector.stop()));
  connectors.length = 0;
});

function track(connector: MSTeamsConnector): MSTeamsConnector {
  connectors.push(connector);
  return connector;
}

describe("msteamsActivityToInbound", () => {
  it("converts Teams message activities to inbound channel messages", () => {
    const inbound = msteamsActivityToInbound({
      type: "message",
      id: "activity-1",
      text: '<at>Jait</at> hello&nbsp;<b>there</b>',
      timestamp: "2026-06-04T10:00:00.000Z",
      serviceUrl: "https://smba.trafficmanager.net/emea/",
      conversation: { id: "19:abc@thread.tacv2;messageid=root", conversationType: "channel" },
      from: { id: "teams-user-id", aadObjectId: "aad-user-id", name: "Alice" },
      recipient: { id: "bot-id" },
    });

    expect(inbound).toMatchObject({
      channelId: "msteams",
      conversationId: "19:abc@thread.tacv2",
      senderId: "aad-user-id",
      senderName: "Alice",
      text: "hello there",
      fromMe: false,
      isSelfChat: false,
    });
  });
});

describe("isAllowedMSTeamsServiceUrl", () => {
  it("allows Microsoft Bot Framework service hosts only", () => {
    expect(isAllowedMSTeamsServiceUrl("https://smba.trafficmanager.net/emea/")).toBe(true);
    expect(isAllowedMSTeamsServiceUrl("https://region.botframework.azure.cn/teams/")).toBe(true);
    expect(isAllowedMSTeamsServiceUrl("http://smba.trafficmanager.net/emea/")).toBe(false);
    expect(isAllowedMSTeamsServiceUrl("https://example.com/teams/")).toBe(false);
  });
});

describe("MSTeamsConnector", () => {
  it("receives webhook messages and sends replies via Bot Framework", async () => {
    const inbound: InboundMessage[] = [];
    const sentBodies: unknown[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/oauth2/v2.0/token")) {
        return new Response(JSON.stringify({ access_token: "bot-token", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/v3/conversations/")) {
        sentBodies.push(JSON.parse(String(init?.body ?? "{}")));
        expect(init?.headers).toMatchObject({ Authorization: "Bearer bot-token" });
        return new Response(JSON.stringify({ id: "sent-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("unexpected", { status: 500 });
    };
    const connector = track(new MSTeamsConnector({
      appId: "app-id",
      appPassword: "secret",
      tenantId: "tenant-id",
      host: "127.0.0.1",
      port: 0,
      fetchImpl,
      validateAuth: async () => {},
    }));

    await connector.start({ onInbound: (msg) => inbound.push(msg), onStatus: () => {} });
    const port = connector.listenPort();
    expect(port).toBeTypeOf("number");

    const res = await fetch(`http://127.0.0.1:${port}/api/messages`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "message",
        id: "activity-1",
        text: "<at>Jait</at> ping",
        serviceUrl: "https://smba.trafficmanager.net/emea/",
        conversation: { id: "19:abc@thread.tacv2", conversationType: "channel" },
        from: { id: "teams-user-id", name: "Alice" },
        recipient: { id: "bot-id", role: "bot" },
        channelData: { tenant: { id: "tenant-id" } },
      }),
    });

    expect(res.status).toBe(202);
    expect(inbound).toMatchObject([{ conversationId: "19:abc@thread.tacv2", text: "ping" }]);

    await connector.send({ conversationId: "19:abc@thread.tacv2", text: "pong" });

    expect(sentBodies).toMatchObject([{
      type: "message",
      text: "pong",
      from: { id: "bot-id", role: "bot" },
      recipient: { id: "teams-user-id", name: "Alice" },
      conversation: { id: "19:abc@thread.tacv2", conversationType: "channel", tenantId: "tenant-id" },
      channelData: { tenant: { id: "tenant-id" } },
    }]);
  });

  it("reports missing credential configuration", async () => {
    const statuses: Array<{ status: string; error?: string }> = [];
    const connector = track(new MSTeamsConnector({
      appId: "",
      appPassword: "",
      tenantId: "",
    }));

    await connector.start({
      onInbound: () => {},
      onStatus: (status, detail) => statuses.push({ status, error: detail?.error }),
    });

    expect(statuses).toMatchObject([{
      status: "error",
      error: "MSTEAMS_APP_ID, MSTEAMS_APP_PASSWORD, and MSTEAMS_TENANT_ID are required",
    }]);
  });
});
