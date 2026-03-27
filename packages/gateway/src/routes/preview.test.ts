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

  it("starts and stops a remote browser session for an existing preview session", async () => {
    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const previewService = {
      startRemoteBrowser: vi.fn().mockResolvedValue({
        id: "preview-session-1",
        sessionId: "session-1",
        remoteBrowser: {
          containerName: "jait-browser-sb-test",
          novncUrl: "http://127.0.0.1:6080/vnc.html",
          novncPort: 6080,
          vncPort: 5900,
          startedAt: "2026-03-27T00:00:00.000Z",
        },
      }),
      stopRemoteBrowser: vi.fn().mockResolvedValue(true),
      get: vi.fn().mockReturnValue({
        id: "preview-session-1",
        sessionId: "session-1",
        remoteBrowser: null,
      }),
    };
    registerPreviewRoutes(app, config, {
      previewService: previewService as any,
    });

    const startResponse = await app.inject({
      method: "POST",
      url: "/api/preview/remote/start",
      headers: await authHeader(config.jwtSecret, "user-1"),
      payload: { sessionId: "session-1", workspaceRoot: "/workspace/app" },
    });

    expect(startResponse.statusCode).toBe(200);
    expect(previewService.startRemoteBrowser).toHaveBeenCalledWith("session-1", {
      workspaceRoot: "/workspace/app",
      mountMode: "read-only",
    });

    const stopResponse = await app.inject({
      method: "POST",
      url: "/api/preview/remote/stop",
      headers: await authHeader(config.jwtSecret, "user-1"),
      payload: { sessionId: "session-1" },
    });

    expect(stopResponse.statusCode).toBe(200);
    expect(previewService.stopRemoteBrowser).toHaveBeenCalledWith("session-1");
    expect(stopResponse.json()).toMatchObject({
      ok: true,
      session: {
        id: "preview-session-1",
        remoteBrowser: null,
      },
    });

    await app.close();
  });
});
