import { describe, expect, it } from "vitest";
import { BrowserCollaborationService } from "./browser-collaboration.js";
import { openDatabase, migrateDatabase } from "../db/index.js";

describe("BrowserCollaborationService", () => {
  it("scopes sessions and interventions to the creating user", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const service = new BrowserCollaborationService(db);

    const userOneSession = service.createSession({
      name: "user-one-live",
      browserId: "browser-user-1",
      createdBy: "user-1",
    });
    service.createSession({
      name: "user-two-live",
      browserId: "browser-user-2",
      createdBy: "user-2",
    });

    service.requestIntervention({
      browserSessionId: userOneSession.id,
      reason: "Login required",
      instructions: "Sign in and continue",
      requestedBy: "user-1",
    });

    expect(service.listSessions("user-1").map((session) => session.id)).toEqual([userOneSession.id]);
    expect(service.listSessions("user-2")).toHaveLength(1);
    expect(service.listInterventions("user-1")).toHaveLength(1);
    expect(service.listInterventions("user-2")).toHaveLength(0);

    sqlite.close();
  });

  it("transfers control and blocks agent actions while user is controlling", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const service = new BrowserCollaborationService(db);
    const session = service.createSession({
      name: "live-test",
      browserId: "browser-1",
      createdBy: "user-1",
    });

    service.takeControl(session.id, "user-1");

    expect(() => service.assertAgentControl("browser-1")).toThrow(/controlled by the user/i);

    service.returnControl(session.id, "user-1");

    expect(() => service.assertAgentControl("browser-1")).not.toThrow();
    sqlite.close();
  });

  it("creates and resolves interventions by returning control to the agent", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const service = new BrowserCollaborationService(db);
    const session = service.createSession({
      name: "live-test",
      browserId: "browser-2",
      createdBy: "user-1",
    });

    const intervention = service.requestIntervention({
      browserSessionId: session.id,
      reason: "Login required",
      instructions: "Sign in and continue",
      requestedBy: "user-1",
      secretSafe: true,
    });

    expect(service.getSession(session.id, "user-1")?.status).toBe("intervention-required");
    expect(service.getSession(session.id, "user-1")?.controller).toBe("user");
    expect(service.getSession(session.id, "user-1")?.secretSafe).toBe(true);

    const resolved = service.resolveIntervention(intervention.id, "user-1", "done");
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.userNote).toBe("done");
    expect(service.getSession(session.id, "user-1")?.status).toBe("ready");
    expect(service.getSession(session.id, "user-1")?.controller).toBe("agent");
    sqlite.close();
  });

  it("syncs preview sessions onto the existing browser session and preserves paused state", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const service = new BrowserCollaborationService(db);

    const session = service.createSession({
      name: "preview-session",
      browserId: "browser-3",
      previewSessionId: "preview-session-1",
      workspaceRoot: "/workspace/app",
      createdBy: "user-1",
    });

    service.pause(session.id, "user-1");

    const synced = service.syncPreviewSession({
      id: "preview-session-1",
      sessionId: "preview-session-1",
      workspaceRoot: "/workspace/app",
      mode: "local",
      status: "ready",
      target: "http://127.0.0.1:4173/",
      command: "bun run dev",
      port: 4173,
      url: "/api/dev-proxy/4173/",
      browserId: "browser-3",
      processId: 123,
      containerId: null,
      logs: [],
      browserEvents: [],
      lastError: null,
      createdAt: "2026-03-27T00:00:00.000Z",
      updatedAt: "2026-03-27T00:00:00.000Z",
    }, {
      userId: "user-1",
      workspaceRoot: "/workspace/app",
      mode: "isolated",
      storageProfile: { browserProfile: "/tmp/jait-browser-3" },
    });

    expect(synced.id).toBe(session.id);
    expect(synced.status).toBe("paused");
    expect(synced.origin).toBe("managed");
    expect(synced.mode).toBe("isolated");
    expect(synced.previewUrl).toBe("/api/dev-proxy/4173/");
    expect(synced.targetUrl).toBe("http://127.0.0.1:4173/");
    expect(synced.storageProfile).toEqual({ browserProfile: "/tmp/jait-browser-3" });

    service.closePreviewSession("preview-session-1");

    expect(service.getSession(session.id, "user-1")?.status).toBe("closed");
    expect(service.listSessions("user-1")).toHaveLength(1);

    sqlite.close();
  });

  it("looks up a browser session by preview session id", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const service = new BrowserCollaborationService(db);

    const session = service.createSession({
      name: "preview-linked",
      previewSessionId: "preview-session-lookup",
      createdBy: "user-1",
    });

    expect(service.getSessionByPreviewSessionId("preview-session-lookup")?.id).toBe(session.id);
    expect(service.getSessionByPreviewSessionId("missing-preview-session")).toBeNull();

    sqlite.close();
  });
});
