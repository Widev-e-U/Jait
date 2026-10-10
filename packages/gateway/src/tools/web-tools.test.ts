import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebFetchTool, createWebSearchTool } from "./browser-tools.js";
import { createWebTool } from "./core/web.js";
const context = { sessionId: "web-tests", actionId: "web-action", projectRoot: "/project", requestedBy: "test" };
const fetch = vi.fn();
beforeEach(() => { fetch.mockReset(); vi.stubGlobal("fetch", fetch); vi.stubEnv("WEB_FETCH_IGNORE_TLS_ERRORS", "false"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("web.fetch", () => {
  it("returns HTTP status and bounded page content", async () => {
    fetch.mockResolvedValue(new Response("Inventory fixture page", { headers: { "Content-Type": "text/plain" } }));
    expect(await createWebFetchTool().execute({ url: "https://example.com/", maxBytes: 9 }, context)).toMatchObject({
      ok: true, data: { url: "https://example.com/", status: 200, body: "Inventory", insecureTlsUsed: false },
    });
  });
  it.each(["http://127.0.0.1/", "http://169.254.169.254/", "file:///etc/passwd"])("blocks disallowed target %s before fetching", async (url) => {
    await expect(createWebFetchTool().execute({ url }, context)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not report HTTP failures as success", async () => {
    fetch.mockResolvedValue(new Response("Unavailable", { status: 503 }));
    expect(await createWebFetchTool().execute({ url: "https://example.com/" }, context)).toMatchObject({ ok: false, data: { status: 503 } });
  });
  it("returns a network error instead of throwing", async () => {
    fetch.mockRejectedValue(new Error("Network offline"));
    expect(await createWebFetchTool().execute({ url: "https://example.com/" }, context)).toMatchObject({ ok: false, message: "Fetch failed: Network offline" });
  });
  it("honors cancellation without contacting a server", async () => {
    expect(await createWebFetchTool().execute({ url: "https://example.com/" }, { ...context, signal: AbortSignal.abort() })).toEqual({ ok: false, message: "Cancelled" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
describe("web.search", () => {
  it("honors cancellation without sending API requests", async () => {
    expect(await createWebSearchTool().execute({ query: "asset inventory" }, { ...context, signal: AbortSignal.abort() })).toEqual({ ok: false, message: "Cancelled" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
describe("web", () => {
  it("infers fetch mode and delegates to the protected fetch path", async () => {
    fetch.mockResolvedValue(new Response("Inventory ready"));
    expect(await createWebTool().execute({ url: "https://example.com/" }, context)).toMatchObject({ ok: true, data: { body: "Inventory ready" } });
  });
  it("requires a query or URL", async () => {
    expect((await createWebTool().execute({}, context)).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
