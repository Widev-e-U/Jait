import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { registerBrowserCollaborationRoutes } from "./browser-collaboration.js";
import { BrowserCollaborationService } from "../services/browser-collaboration.js";
import { signAuthToken } from "../security/http-auth.js";
import { interventionRunResumeRegistry } from "../services/intervention-run-resume.js";

async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

describe("browser collaboration routes", () => {
  afterEach(() => {
    interventionRunResumeRegistry.clearForTests();
  });

  it("returns a browser session detail view with linked preview state and open interventions", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const browserCollaborationService = new BrowserCollaborationService(db);
    const previewService = {
      get: vi.fn().mockReturnValue({
        id: "preview-session-1",
        sessionId: "preview-session-1",
        status: "ready",
        url: "/api/dev-proxy/4173/",
      }),
    };
    registerBrowserCollaborationRoutes(app, config, {
      browserCollaborationService,
      previewService: previewService as any,
    });

    const session = browserCollaborationService.createSession({
      name: "live-test",
      previewSessionId: "preview-session-1",
      createdBy: "user-1",
    });
    browserCollaborationService.requestIntervention({
      browserSessionId: session.id,
      reason: "Login required",
      instructions: "Sign in and continue",
      requestedBy: "user-1",
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/browser/sessions/${session.id}`,
      headers: await authHeader(config.jwtSecret, "user-1"),
    });

    expect(response.statusCode).toBe(200);
    expect(previewService.get).toHaveBeenCalledWith("preview-session-1");
    expect(response.json()).toMatchObject({
      session: {
        id: session.id,
        previewSessionId: "preview-session-1",
      },
      previewSession: {
        sessionId: "preview-session-1",
        status: "ready",
      },
      interventions: [
        {
          browserSessionId: session.id,
          status: "open",
        },
      ],
    });

    await app.close();
    sqlite.close();
  });

  it("inspects a browser session through its linked preview session", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const browserCollaborationService = new BrowserCollaborationService(db);
    const previewService = {
      inspect: vi.fn().mockResolvedValue({
        status: "ready",
        url: "/api/dev-proxy/4173/",
        page: { title: "Preview App" },
      }),
    };
    registerBrowserCollaborationRoutes(app, config, {
      browserCollaborationService,
      previewService: previewService as any,
    });

    const session = browserCollaborationService.createSession({
      name: "live-test",
      previewSessionId: "preview-session-1",
      createdBy: "user-1",
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/browser/sessions/${session.id}/inspect?selector=%23submit`,
      headers: await authHeader(config.jwtSecret, "user-1"),
    });

    expect(response.statusCode).toBe(200);
    expect(previewService.inspect).toHaveBeenCalledWith("preview-session-1", "#submit");
    expect(response.json()).toMatchObject({
      inspect: {
        page: { title: "Preview App" },
      },
    });

    await app.close();
    sqlite.close();
  });

  it("suppresses browser session inspection when the session is secret-safe", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const browserCollaborationService = new BrowserCollaborationService(db);
    const previewService = {
      inspect: vi.fn(),
    };
    registerBrowserCollaborationRoutes(app, config, {
      browserCollaborationService,
      previewService: previewService as any,
    });

    const session = browserCollaborationService.createSession({
      name: "secret-live-test",
      previewSessionId: "preview-session-2",
      secretSafe: true,
      createdBy: "user-1",
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/browser/sessions/${session.id}/inspect`,
      headers: await authHeader(config.jwtSecret, "user-1"),
    });

    expect(response.statusCode).toBe(200);
    expect(previewService.inspect).not.toHaveBeenCalled();
    expect(response.json()).toMatchObject({
      inspect: null,
      suppressed: true,
    });

    await app.close();
    sqlite.close();
  });

  it("resolves an intervention by steering the linked active chat session when available", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const browserCollaborationService = new BrowserCollaborationService(db);
    registerBrowserCollaborationRoutes(app, config, { browserCollaborationService });

    const session = browserCollaborationService.createSession({
      name: "live-test",
      createdBy: "user-1",
    });
    const intervention = browserCollaborationService.requestIntervention({
      browserSessionId: session.id,
      chatSessionId: "chat-session-1",
      reason: "Login required",
      instructions: "Sign in and continue",
      requestedBy: "user-1",
    });

    const resumeChat = vi.fn().mockResolvedValue({ status: "steered" as const });
    const unregister = interventionRunResumeRegistry.registerChatSession("chat-session-1", resumeChat);

    const response = await app.inject({
      method: "POST",
      url: `/api/browser/interventions/${intervention.id}/resolve`,
      headers: await authHeader(config.jwtSecret, "user-1"),
      payload: { userNote: "Token set in settings" },
    });

    expect(response.statusCode).toBe(200);
    expect(resumeChat).toHaveBeenCalledWith(
      expect.stringContaining(`User completed intervention on browser session ${session.id}.`),
    );
    expect(resumeChat).toHaveBeenCalledWith(
      expect.stringContaining("Note: Token set in settings."),
    );
    expect(response.json()).toMatchObject({
      intervention: {
        id: intervention.id,
        status: "resolved",
        userNote: "Token set in settings",
      },
      resume: {
        chat: {
          status: "steered",
        },
      },
    });

    unregister();
    await app.close();
    sqlite.close();
  });

  it("resolves an intervention by queueing the linked thread resume with a trimmed note", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const browserCollaborationService = new BrowserCollaborationService(db);
    registerBrowserCollaborationRoutes(app, config, { browserCollaborationService });

    const session = browserCollaborationService.createSession({
      name: "thread-live-test",
      createdBy: "user-1",
    });
    const intervention = browserCollaborationService.requestIntervention({
      browserSessionId: session.id,
      threadId: "thread-1",
      reason: "Confirm checkout",
      instructions: "Review the checkout state and continue",
      requestedBy: "user-1",
    });

    const resumeThread = vi.fn().mockResolvedValue({ status: "queued" as const });
    const unregister = interventionRunResumeRegistry.registerThread("thread-1", resumeThread);

    const response = await app.inject({
      method: "POST",
      url: `/api/browser/interventions/${intervention.id}/resolve`,
      headers: await authHeader(config.jwtSecret, "user-1"),
      payload: { userNote: "  Checkout is ready to continue  " },
    });

    expect(response.statusCode).toBe(200);
    expect(resumeThread).toHaveBeenCalledWith(
      expect.stringContaining(`User completed intervention on browser session ${session.id}.`),
    );
    expect(resumeThread).toHaveBeenCalledWith(
      expect.stringContaining("Note: Checkout is ready to continue."),
    );
    expect(response.json()).toMatchObject({
      intervention: {
        id: intervention.id,
        status: "resolved",
        userNote: "Checkout is ready to continue",
      },
      resume: {
        thread: {
          status: "queued",
        },
      },
    });

    unregister();
    await app.close();
    sqlite.close();
  });

  it("rejects intervention creation when required fields are blank", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const browserCollaborationService = new BrowserCollaborationService(db);
    registerBrowserCollaborationRoutes(app, config, { browserCollaborationService });

    const response = await app.inject({
      method: "POST",
      url: "/api/browser/interventions",
      headers: await authHeader(config.jwtSecret, "user-1"),
      payload: { browserSessionId: " ", reason: "", instructions: " " },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "browserSessionId, reason, and instructions are required",
    });

    await app.close();
    sqlite.close();
  });

  it("returns 404 when creating an intervention for an unknown browser session", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const browserCollaborationService = new BrowserCollaborationService(db);
    registerBrowserCollaborationRoutes(app, config, { browserCollaborationService });

    const response = await app.inject({
      method: "POST",
      url: "/api/browser/interventions",
      headers: await authHeader(config.jwtSecret, "user-1"),
      payload: {
        browserSessionId: "missing-session",
        reason: "Login required",
        instructions: "Sign in and continue",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: "Browser session not found",
    });

    await app.close();
    sqlite.close();
  });
});
