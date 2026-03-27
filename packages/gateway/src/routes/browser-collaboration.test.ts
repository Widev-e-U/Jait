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
});
