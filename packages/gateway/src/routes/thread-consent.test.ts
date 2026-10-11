import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { ConsentManager } from "../security/consent-manager.js";
import { ControlAccess } from "../security/control-access.js";
import { signAuthToken } from "../security/http-auth.js";
import type { SessionService } from "../services/sessions.js";
import type { ThreadService } from "../services/threads.js";
import { DeviceRegistry } from "../services/device-registry.js";
import { registerMobileRoutes } from "./mobile.js";
import { registerConsentRoutes } from "./consent.js";

describe("persona thread approval ownership", () => {
  let app: ReturnType<typeof Fastify>;
  let manager: ConsentManager;
  let owner: { authorization: string };
  let stranger: { authorization: string };
  let id: string;
  let decision: ReturnType<ConsentManager["requestConsent"]>;
  beforeEach(async () => {
    manager = new ConsentManager();
    app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "thread-consent-test-secret" };
    const sessions = { getById: () => undefined } as unknown as SessionService;
    const threads = { getById: (id: string) => id === "owned-thread" ? { id, userId: "owner" } : undefined } as unknown as ThreadService;
    const access = new ControlAccess(sessions, undefined, manager, threads);
    registerConsentRoutes(app, manager, { write: vi.fn() } as any, { config, access });
    registerMobileRoutes(app, { deviceRegistry: new DeviceRegistry(), consentManager: manager, sessionService: sessions, threadService: threads, config });
    owner = { authorization: "Bearer " + await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret) };
    stranger = { authorization: "Bearer " + await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret) };
    decision = manager.requestConsent({
      sessionId: "owned-thread", actionId: "thread-tool", toolName: "file.patch", summary: "Edit assigned source file",
      preview: {}, risk: "medium", policy: { consentLevel: "once", description: "Ask first", knownTool: true, source: "profile" },
    });
    id = manager.listPending()[0]!.id;
  });
  afterEach(async () => { manager.cancelAll(); await app.close(); });

  it("lists the owner's thread approval and allows the owner to approve it", async () => {
    const list = await app.inject({ url: "/api/consent/pending", headers: owner });
    expect(list.statusCode).toBe(200);
    expect(list.json().requests.map((entry: { id: string }) => entry.id)).toEqual([id]);
    const approval = await app.inject({ method: "POST", url: `/api/consent/${id}/approve`, headers: owner });
    expect(approval.statusCode).toBe(200);
    expect((await decision).approved).toBe(true);
  });

  it("hides another user's thread approval and rejects their action", async () => {
    const list = await app.inject({ url: "/api/consent/pending", headers: stranger });
    expect(list.json().requests).toEqual([]);
    const approval = await app.inject({ method: "POST", url: `/api/consent/${id}/approve`, headers: stranger });
    expect(approval.statusCode).toBe(404);
    expect(manager.listPending()).toHaveLength(1);
  });

  it("applies the same owner boundary to mobile thread approvals", async () => {
    const url = `/api/mobile/consent/${id}/approve`;
    expect((await app.inject({ method: "POST", url })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url, headers: stranger })).statusCode).toBe(404);
    expect(manager.listPending()).toHaveLength(1);
    expect((await app.inject({ method: "POST", url, headers: owner })).statusCode).toBe(200);
    expect((await decision).approved).toBe(true);
  });

  it("does not expose thread approval to an anonymous caller", async () => {
    expect((await app.inject({ method: "POST", url: `/api/consent/${id}/approve` })).statusCode).toBe(401);
    expect(manager.listPending()).toHaveLength(1);
  });
});
