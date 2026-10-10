import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOllamaSettingsUsage, fetchOpenCodeGoUsage, normalizeOllamaSession, parseOllamaSettingsUsage } from "./subscription-usage-fetchers.js";

export const settingsHtml = `<div data-usage-meter><div data-usage-track aria-label="Session usage: 42.5%"></div></div>
  <div data-time="2026-10-09T12:00:00Z"></div>
  <div data-usage-meter><div aria-label='Weekly usage: 81%' data-usage-track></div></div>
  <div data-time="2026-10-15T10:00:00Z"></div>`;
const window = { status: "ok", percent: 20, resetsAt: "2026-10-09T12:00:00Z" };
afterEach(() => vi.unstubAllGlobals());

describe("subscription usage fetchers", () => {
  it("reads dashboard percentages and associates each reset with its own meter", () => {
    expect(parseOllamaSettingsUsage(settingsHtml)).toEqual({ source: "settings", limits: {
      session: { usage: 0.425, models: [], resetsAt: "2026-10-09T12:00:00.000Z" },
      weekly: { usage: 0.81, models: [], resetsAt: "2026-10-15T10:00:00.000Z" },
    } });
    expect(parseOllamaSettingsUsage(settingsHtml.replace(/data-time="[^"]*"/g, 'data-time="invalid"')).limits.session?.resetsAt).toBeNull();
  });
  it("fails closed on login pages, missing windows and invalid values", () => {
    for (const html of ["<form>Sign in</form>", settingsHtml.replace("81%", "bad"), settingsHtml.replace("42.5%", "142.5%"), `<script>${settingsHtml}</script>`, `<!--${settingsHtml}-->`]) {
      expect(() => parseOllamaSettingsUsage(html)).toThrow();
    }
  });
  it("accepts a cookie value while refusing injected cookies and headers", () => {
    expect(normalizeOllamaSession(" __Secure-session=value ")).toBe("value");
    for (const value of ["", "a;b=c", "a\r\nX: test", "a b", "x".repeat(4097)]) expect(() => normalizeOllamaSession(value)).toThrow();
  });
  it("uses only the fixed Ollama origin and never follows redirects", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(settingsHtml)); vi.stubGlobal("fetch", mock);
    expect((await fetchOllamaSettingsUsage("private-session")).limits.weekly?.usage).toBe(0.81);
    expect(mock).toHaveBeenCalledWith("https://ollama.com/settings", expect.objectContaining({ redirect: "manual", headers: { Cookie: "__Secure-session=private-session", Accept: "text/html" } }));
    mock.mockResolvedValue(new Response("private-provider-details", { status: 303, headers: { location: "https://evil.invalid" } }));
    await expect(fetchOllamaSettingsUsage("private-session")).rejects.toThrow("expired");
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("caps Ollama response bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(2_000_001))));
    await expect(fetchOllamaSettingsUsage("session")).rejects.toThrow("too large");
  });
  it("fetches all Go windows with Bearer authentication", async () => {
    const body = { usage: { rolling: window, weekly: { ...window, percent: 90 }, monthly: { ...window, status: "rate-limited", percent: 100 } } };
    const mock = vi.fn().mockResolvedValue(Response.json(body)); vi.stubGlobal("fetch", mock);
    expect(await fetchOpenCodeGoUsage("go-key")).toEqual(body);
    expect(mock).toHaveBeenCalledWith("https://opencode.ai/zen/go/v1/usage", expect.objectContaining({ redirect: "error", headers: { Authorization: "Bearer go-key", Accept: "application/json" } }));
  });
  it("rejects malformed Go counters and gives safe auth/entitlement errors", async () => {
    const mock = vi.fn(); vi.stubGlobal("fetch", mock);
    for (const body of [null, {}, { usage: { rolling: window } }, { usage: { rolling: { ...window, percent: "20" }, weekly: window, monthly: window } }]) {
      mock.mockResolvedValue(Response.json(body)); await expect(fetchOpenCodeGoUsage("key")).rejects.toThrow("unexpected");
    }
    for (const [status, message] of [[401, "rejected"], [403, "subscription"], [500, "failed"]] as const) {
      mock.mockResolvedValue(new Response("private-provider-details", { status })); await expect(fetchOpenCodeGoUsage("key")).rejects.toThrow(message);
    }
  });
});
