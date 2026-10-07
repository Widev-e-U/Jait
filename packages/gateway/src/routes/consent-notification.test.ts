import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { ConsentManager } from "../security/consent-manager.js";
import { ControlAccess } from "../security/control-access.js";
import { signAuthToken } from "../security/http-auth.js";
import type { AuditWriter } from "../services/audit.js";
import { SessionService } from "../services/sessions.js";
import { CONSENT_ATTENTION_ACTIONS } from "../services/attention.js";
import { registerConsentRoutes } from "./consent.js";

describe("notification bulk consent", () => {
  let opened: Awaited<ReturnType<typeof openDatabase>>;
  let app: ReturnType<typeof Fastify>;
  let manager: ConsentManager;
  let sessions: SessionService;
  let headers: { authorization: string };
  const write = vi.fn();

  beforeEach(async () => {
    opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    sessions = new SessionService(opened.db);
    manager = new ConsentManager({ db: opened.db });
    const config = { ...loadConfig(), jwtSecret: "notification-test-secret" };
    app = Fastify();
    write.mockClear();
    registerConsentRoutes(app, manager, { write } as unknown as AuditWriter, {
      config, access: new ControlAccess(sessions, undefined, manager),
    });
    headers = { authorization: "Bearer " + await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret) };
  });
  afterEach(async () => {
    manager.cancelAll();
    await app.close();
    opened.sqlite.close();
  });
  function request(sessionId: string) {
    return manager.requestConsent({
      sessionId, actionId: "action", toolName: "terminal.run", summary: "Run command", preview: {}, risk: "medium",
      policy: { consentLevel: "always", description: "Ask first", knownTool: true, source: "profile" },
    });
  }
  const approve = (id: string, auth = headers) => app.inject({ method: "POST", url: `/api/consent/${id}/approve-all`, headers: auth });

  it("offers three consent notification actions", () => {
    expect(CONSENT_ATTENTION_ACTIONS.map(action => action.id)).toEqual(["approve", "reject", "approve-all"]);
    expect(CONSENT_ATTENTION_ACTIONS[2]).toMatchObject({ label: "Approve all", kind: "approve-all" });
  });

  it("approves only the originating chat's pending requests, audits each, and retains future prompts", async () => {
    const chat = sessions.create({ userId: "owner" });
    const other = sessions.create({ userId: "owner" });
    const first = request(chat.id);
    const second = request(chat.id);
    void request(other.id);
    const ids = manager.listPending(chat.id).map(entry => entry.id);
    const response = await approve(ids[0]!);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ sessionId: chat.id, approvedCount: 2, requestIds: ids });
    expect((await Promise.all([first, second])).every(decision => decision.approved)).toBe(true);
    expect(manager.listPending(other.id)).toHaveLength(1);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls.every(([entry]) => entry.sessionId === chat.id && entry.inputs.bulk)).toBe(true);
    expect(manager.isApproveAllEnabledForSession(chat.id)).toBe(false);
    void request(chat.id);
    expect(manager.listPending(chat.id)).toHaveLength(1);
    expect((await approve(ids[0]!)).statusCode).toBe(404);
    expect(manager.listPending(chat.id)).toHaveLength(1);
  });

  it("rejects unauthenticated, foreign and unknown request actions without mutating consent", async () => {
    const foreign = sessions.create({ userId: "someone-else" });
    void request(foreign.id);
    const id = manager.listPending(foreign.id)[0]!.id;
    expect((await approve(id, { authorization: "" })).statusCode).toBe(401);
    expect((await approve(id)).statusCode).toBe(404);
    expect((await approve("missing")).statusCode).toBe(404);
    expect(manager.listPending(foreign.id)).toHaveLength(1);
    expect(manager.isApproveAllEnabledForSession(foreign.id)).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});
