import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { registerPreviewRoutes } from "./preview.js";
import { signAuthToken } from "../security/http-auth.js";

async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

describe("preview routes", () => {
  it("authenticates and authorizes refresh and reports control errors", async () => {
    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const previewService = { reload: vi.fn().mockResolvedValue({ browserId: "browser-1" }) };
    const sessionService = { getById: vi.fn((id: string, userId: string) => id === "session-1" && userId === "user-1" ? { id } : null) };
    registerPreviewRoutes(app, config, { previewService: previewService as any, sessionService: sessionService as any });
    const payload = { sessionId: "session-1" };
    expect((await app.inject({ method: "POST", url: "/api/preview/reload", payload })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/preview/reload", headers: await authHeader(config.jwtSecret, "user-2"), payload })).statusCode).toBe(404);
    expect(previewService.reload).not.toHaveBeenCalled();
    const headers = await authHeader(config.jwtSecret, "user-1");
    expect((await app.inject({ method: "POST", url: "/api/preview/reload", headers, payload })).statusCode).toBe(200);
    expect(previewService.reload).toHaveBeenCalledWith("session-1");
    previewService.reload.mockRejectedValueOnce(new Error("Take control before refreshing."));
    const blocked = await app.inject({ method: "POST", url: "/api/preview/reload", headers, payload });
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().error).toContain("Take control");
    await app.close();
  });

  it("restricts history navigation to the session owner and validates direction", async () => {
    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const previewService = { history: vi.fn().mockResolvedValue({ sessionId: "session-1" }) };
    const sessionService = { getById: vi.fn((id: string, userId: string) => id === "session-1" && userId === "user-1" ? { id } : null) };
    registerPreviewRoutes(app, config, { previewService: previewService as any, sessionService: sessionService as any });
    const payload = { sessionId: "session-1", direction: "back" };
    expect((await app.inject({ method: "POST", url: "/api/preview/history", payload })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/preview/history", headers: await authHeader(config.jwtSecret, "user-2"), payload })).statusCode).toBe(404);
    expect(previewService.history).not.toHaveBeenCalled();
    const headers = await authHeader(config.jwtSecret, "user-1");
    expect((await app.inject({ method: "POST", url: "/api/preview/history", headers, payload: { ...payload, direction: "invalid" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/preview/history", headers, payload })).statusCode).toBe(200);
    expect(previewService.history).toHaveBeenCalledWith("session-1", "back");
    await app.close();
  });

  it("restricts URL navigation to the authenticated session owner", async () => {
    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const previewService = { navigate: vi.fn().mockResolvedValue({ sessionId: "session-1" }) };
    const sessionService = { getById: vi.fn((id: string, userId: string) => id === "session-1" && userId === "user-1" ? { id } : null) };
    registerPreviewRoutes(app, config, { previewService: previewService as any, sessionService: sessionService as any });
    const payload = { sessionId: "session-1", url: "https://example.com/" };
    expect((await app.inject({ method: "POST", url: "/api/preview/navigate", payload })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/preview/navigate", headers: await authHeader(config.jwtSecret, "user-2"), payload })).statusCode).toBe(404);
    expect(previewService.navigate).not.toHaveBeenCalled();
    expect((await app.inject({ method: "POST", url: "/api/preview/navigate", headers: await authHeader(config.jwtSecret, "user-1"), payload })).statusCode).toBe(200);
    expect(previewService.navigate).toHaveBeenCalledWith("session-1", payload.url);
    previewService.navigate.mockRejectedValueOnce(new Error("Take control before navigating."));
    expect((await app.inject({ method: "POST", url: "/api/preview/navigate", headers: await authHeader(config.jwtSecret, "user-1"), payload })).statusCode).toBe(400);
    await app.close();
  });

  it("lets only the owning user change preview sharing", async () => {
    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const previewService = {
      setSharedWithAgent: vi.fn().mockReturnValue({ sessionId: "session-1", sharedWithAgent: true }),
    };
    const sessionService = {
      getById: vi.fn((id: string, userId: string) => id === "session-1" && userId === "user-1" ? { id } : null),
    };
    registerPreviewRoutes(app, config, { previewService: previewService as any, sessionService: sessionService as any });

    const body = { sessionId: "session-1", sharedWithAgent: true };
    const denied = await app.inject({ method: "POST", url: "/api/preview/share", headers: await authHeader(config.jwtSecret, "user-2"), payload: body });
    expect(denied.statusCode).toBe(404);
    expect(previewService.setSharedWithAgent).not.toHaveBeenCalled();

    const allowed = await app.inject({ method: "POST", url: "/api/preview/share", headers: await authHeader(config.jwtSecret, "user-1"), payload: body });
    expect(allowed.statusCode).toBe(200);
    expect(previewService.setSharedWithAgent).toHaveBeenCalledWith("session-1", true);
    await app.close();
  });

  it("returns preview inspection including selector diagnostics", async () => {
    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const previewService = {
      inspect: vi.fn().mockResolvedValue({
        status: "ready",
        url: "/api/dev-proxy/4173/",
        browserEvents: [],
        logs: [],
        screenshot: null,
        page: {
          title: "Preview App",
          url: "http://127.0.0.1:4173/",
          text: "Ready",
          elements: [],
          activeElement: null,
          dialogs: [],
          obstruction: null,
        },
        snapshot: "Title: Preview App",
        target: {
          selector: "#submit",
          found: true,
          obscured: true,
        },
      }),
    };
    registerPreviewRoutes(app, config, {
      previewService: previewService as any,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/preview/inspect/session-1?selector=%23submit",
      headers: await authHeader(config.jwtSecret, "user-1"),
    });

    expect(response.statusCode).toBe(200);
    expect(previewService.inspect).toHaveBeenCalledWith("session-1", "#submit");
    expect(response.json()).toMatchObject({
      inspect: {
        page: { title: "Preview App" },
        target: { selector: "#submit", obscured: true },
      },
    });

    await app.close();
  });

  it("suppresses preview inspection when the linked browser session is secret-safe", async () => {
    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const previewService = {
      inspect: vi.fn(),
    };
    const browserCollaborationService = {
      getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "bs_1", secretSafe: true }),
    };
    registerPreviewRoutes(app, config, {
      previewService: previewService as any,
      browserCollaborationService: browserCollaborationService as any,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/preview/inspect/session-1",
      headers: await authHeader(config.jwtSecret, "user-1"),
    });

    expect(response.statusCode).toBe(200);
    expect(previewService.inspect).not.toHaveBeenCalled();
    expect(response.json()).toMatchObject({
      inspect: null,
      suppressed: true,
    });

    await app.close();
  });
});
