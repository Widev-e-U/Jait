import { describe, expect, it } from "vitest";
import { BrowserCollaborationService } from "./browser-collaboration.js";
import { openDatabase, migrateDatabase } from "../db/index.js";

describe("BrowserCollaborationService", () => {
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
});
