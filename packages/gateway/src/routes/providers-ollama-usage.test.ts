import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { ProviderRegistry } from "../providers/registry.js";
import { signAuthToken } from "../security/http-auth.js";
import { fetchSignedInOllamaUsage } from "../services/ollama-device-auth.js";
import { OllamaUsageError } from "../services/provider-quota-fetchers.js";
import { registerProviderRoutes } from "./providers.js";

vi.mock("../services/ollama-device-auth.js", () => ({ fetchSignedInOllamaUsage: vi.fn() }));
const account = { email: "me@example.com", name: "Me", plan: "pro" };
const usage = { limits: { weekly: { usage: 0.09, models: [] } } };
beforeEach(() => { vi.mocked(fetchSignedInOllamaUsage).mockReset().mockResolvedValue(usage); });
afterEach(() => { vi.unstubAllGlobals(); });

async function setup(apiKey?: string) {
  const config = loadConfig();
  const token = await signAuthToken({ id: "user-1", username: "test" }, config.jwtSecret);
  const recordOllamaUsage = vi.fn();
  const app = Fastify({ logger: false });
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    providerUsageService: { recordOllamaUsage, listForUser: () => [] } as never,
    userService: { getSettings: () => ({ jaitBackend: "ollama", apiKeys: { OLLAMA_URL: "http://localhost:11434", ...(apiKey ? { OLLAMA_API_KEY: apiKey } : {}) } }) } as never,
  });
  const request = () => app.inject({ method: "GET", url: "/api/provider-usage/summary", headers: { authorization: `Bearer ${token}` } });
  return { app, recordOllamaUsage, request };
}

describe("Ollama quota route", () => {
  it("records daemon-authenticated quota with normalized account and plan", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ Email: account.email, Name: account.name, Plan: account.plan })));
    const { app, recordOllamaUsage, request } = await setup();
    try {
      expect((await request()).statusCode).toBe(200);
      expect(fetchSignedInOllamaUsage).toHaveBeenCalledWith("http://localhost:11434", account);
      expect(recordOllamaUsage).toHaveBeenCalledWith("jait-backend:ollama", usage, "pro");
    } finally { await app.close(); }
  });

  it("keeps explicit Cloud API key authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(account)).mockResolvedValueOnce(Response.json(usage));
    vi.stubGlobal("fetch", fetchMock);
    const { app, recordOllamaUsage, request } = await setup("cloud-key");
    try {
      expect((await request()).statusCode).toBe(200);
      expect(fetchSignedInOllamaUsage).not.toHaveBeenCalled();
      expect(fetchMock.mock.calls[1][0]).toBe("https://ollama.com/api/usage");
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer cloud-key");
      expect(recordOllamaUsage).toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it("does not suggest replacing an API key for a device-auth failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(account)));
    vi.mocked(fetchSignedInOllamaUsage).mockRejectedValue(new OllamaUsageError("Ollama device authentication request failed (401)", 401));
    const { app, recordOllamaUsage, request } = await setup();
    try {
      const response = await request();
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("Ollama device authentication request failed (401)");
      expect(response.body).not.toContain("Re-enter a valid");
      expect(recordOllamaUsage).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
});
