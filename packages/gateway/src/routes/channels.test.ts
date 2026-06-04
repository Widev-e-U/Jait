import Fastify from "fastify";
import { describe, expect, it, beforeEach } from "vitest";
import { openRawSqlite } from "../db/sqlite-shim.js";
import { ChannelManager, type ReplyGenerator } from "../channels/manager.js";
import { registerChannelRoutes } from "./channels.js";
import type { ChannelConnector, ChannelConnectorEvents, ChannelStatus, OutboundMessage } from "../channels/types.js";
import type { LLMConfig } from "../tools/agent-loop.js";
import { signAuthToken } from "../security/http-auth.js";
import type { AppConfig } from "../config.js";

class FakeConnector implements ChannelConnector {
  readonly id = "whatsapp";
  readonly label = "WhatsApp";
  private _status: ChannelStatus = "stopped";
  async start(events: ChannelConnectorEvents) { this._status = "qr"; events.onStatus("qr", { qr: "data:image/png;base64,abc" }); }
  async stop() { this._status = "stopped"; }
  async send(_msg: OutboundMessage) {}
  status() { return this._status; }
  currentQr() { return this._status === "qr" ? "data:image/png;base64,abc" : null; }
}

const noopGen: ReplyGenerator = { async generate() { return ""; } };
const fakeLLM = { baseUrl: "http://x", apiKey: "x", model: "m" } as LLMConfig;
const config = { jwtSecret: "test-secret" } as AppConfig;
const authUser = { id: "user-1", username: "tester" };

async function authHeaders() {
  const token = await signAuthToken(authUser, config.jwtSecret);
  return { Authorization: `Bearer ${token}` };
}

async function buildApp() {
  const sqlite = await openRawSqlite(":memory:");
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: noopGen });
  mgr.register(new FakeConnector());
  const app = Fastify();
  registerChannelRoutes(app, config, mgr);
  return { app, mgr };
}

describe("channel routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  beforeEach(async () => { ({ app } = await buildApp()); });

  it("requires auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/channels" });
    expect(res.statusCode).toBe(401);
  });

  it("lists channels", async () => {
    const res = await app.inject({ method: "GET", url: "/api/channels", headers: await authHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0]).toMatchObject({ id: "whatsapp", status: "stopped", enabled: false });
  });

  it("starts a channel and returns a QR", async () => {
    const res = await app.inject({ method: "POST", url: "/api/channels/whatsapp/start", headers: await authHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, status: "qr" });
    expect(res.json().qr).toContain("data:image/png;base64,");
  });

  it("polls status", async () => {
    await app.inject({ method: "POST", url: "/api/channels/whatsapp/start", headers: await authHeaders() });
    const res = await app.inject({ method: "GET", url: "/api/channels/whatsapp/status", headers: await authHeaders() });
    expect(res.json()).toMatchObject({ id: "whatsapp", status: "qr" });
  });

  it("updates config", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/channels/whatsapp/config",
      headers: await authHeaders(),
      payload: { allowedSenders: ["123"], respondToAll: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ allowedSenders: ["123"], respondToAll: true });
  });

  it("404s for an unknown channel", async () => {
    const res = await app.inject({ method: "GET", url: "/api/channels/telegram/status", headers: await authHeaders() });
    expect(res.statusCode).toBe(404);
  });

  it("stops a channel", async () => {
    await app.inject({ method: "POST", url: "/api/channels/whatsapp/start", headers: await authHeaders() });
    const res = await app.inject({ method: "POST", url: "/api/channels/whatsapp/stop", headers: await authHeaders() });
    expect(res.json()).toMatchObject({ ok: true });
  });
});
