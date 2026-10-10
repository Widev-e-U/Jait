import Fastify from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { ProviderRegistry } from "../providers/registry.js";
import { signAuthToken } from "../security/http-auth.js";
import { registerProviderRoutes } from "./providers.js";
const html = `<div data-usage-meter><div data-usage-track aria-label="Session usage: 40%"></div></div><div data-time="2026-10-09T12:00:00Z"></div><div data-usage-meter><div data-usage-track aria-label="Weekly usage: 80%"></div></div>`;
afterEach(() => vi.unstubAllGlobals());
async function setup(keys: Record<string, string> = {}) {
  const config = loadConfig(); const token = await signAuthToken({ id: "user-1", username: "test" }, config.jwtSecret);
  const updateSettings = vi.fn(), recordOllamaUsage = vi.fn(), recordOpenCodeGoUsage = vi.fn();
  const app = Fastify({ logger: false });
  registerProviderRoutes(app, config, { providerRegistry: new ProviderRegistry(),
    userService: { getSettings: () => ({ apiKeys: { OTHER_KEY: "keep", ...keys } }), updateSettings } as never,
    providerUsageService: { recordOllamaUsage, recordOpenCodeGoUsage, listForUser: () => [] } as never,
  });
  return { app, token, updateSettings, recordOllamaUsage, recordOpenCodeGoUsage };
}
it("verifies session before saving, preserves other keys, and never echoes secrets", async () => {
  const mock = vi.fn().mockResolvedValue(new Response(html)); vi.stubGlobal("fetch", mock);
  const { app, token, updateSettings } = await setup();
  try {
    const r = await app.inject({ method: "POST", url: "/api/provider-usage/ollama/session", headers: { authorization: `Bearer ${token}` }, payload: { session: " private-cookie " } });
    expect(r.statusCode).toBe(200); expect(r.body).not.toContain("private-cookie");
    expect(updateSettings).toHaveBeenCalledWith("user-1", { apiKeys: { OTHER_KEY: "keep", OLLAMA_SESSION_COOKIE: "private-cookie" } });
    mock.mockResolvedValue(new Response("login", { status: 303 })); updateSettings.mockClear();
    const failed = await app.inject({ method: "POST", url: "/api/provider-usage/ollama/session", headers: { authorization: `Bearer ${token}` }, payload: { session: "expired-cookie" } });
    expect(failed.statusCode).toBe(400); expect(updateSettings).not.toHaveBeenCalled();
    const denied = await app.inject({ method: "POST", url: "/api/provider-usage/ollama/session", payload: { session: "cookie" } });
    expect(denied.statusCode).toBe(401); expect(mock).toHaveBeenCalledTimes(2);
  } finally { await app.close(); }
});
it("removes a session without contacting the provider", async () => {
  const mock = vi.fn(); vi.stubGlobal("fetch", mock);
  const { app, token, updateSettings } = await setup({ OLLAMA_SESSION_COOKIE: "old" });
  try {
    expect((await app.inject({ method: "POST", url: "/api/provider-usage/ollama/session", headers: { authorization: `Bearer ${token}` }, payload: { session: null } })).statusCode).toBe(200);
    expect(updateSettings).toHaveBeenCalledWith("user-1", { apiKeys: { OTHER_KEY: "keep" } }); expect(mock).not.toHaveBeenCalled();
  } finally { await app.close(); }
});
it("refreshes dashboard quota even when the daemon is offline and avoids claiming daemon identity", async () => {
  const mock = vi.fn().mockResolvedValue(new Response(html)); vi.stubGlobal("fetch", mock);
  const { app, token, recordOllamaUsage } = await setup({ OLLAMA_URL: "http://localhost:11434", OLLAMA_SESSION_COOKIE: "session" });
  try {
    const headers = { authorization: `Bearer ${token}` };
    expect((await app.inject({ url: "/api/provider-usage/summary?refresh=0", headers })).statusCode).toBe(200);
    expect(mock).not.toHaveBeenCalled();
    expect((await app.inject({ url: "/api/provider-usage/summary", headers })).statusCode).toBe(200);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(recordOllamaUsage).toHaveBeenCalledWith("jait-backend:user-1:ollama", expect.objectContaining({ source: "settings" }), null, null);
  } finally { await app.close(); }
});
it("includes Go backend profiles and refreshes with their saved key", async () => {
  const window = { status: "ok", percent: 10, resetsAt: "2026-10-09T12:00:00Z" };
  const mock = vi.fn().mockResolvedValue(Response.json({ usage: { rolling: window, weekly: window, monthly: window } })); vi.stubGlobal("fetch", mock);
  const { app, token, recordOpenCodeGoUsage } = await setup({ OPENCODE_GO_API_KEY: "go-key" });
  try {
    const headers = { authorization: `Bearer ${token}` };
    const cached = await app.inject({ url: "/api/provider-usage/summary?refresh=0", headers });
    expect(cached.json().profiles[0].providerLabel).toBe("OpenCode Go"); expect(mock).not.toHaveBeenCalled();
    const r = await app.inject({ url: "/api/provider-usage/summary", headers });
    expect(r.statusCode).toBe(200); expect(r.body).not.toContain("go-key");
    expect(recordOpenCodeGoUsage).toHaveBeenCalledWith("jait-backend:user-1:opencode-go", expect.any(Object));
  } finally { await app.close(); }
});
