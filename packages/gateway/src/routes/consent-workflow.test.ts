import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { ConsentManager } from "../security/consent-manager.js";
import { ControlAccess } from "../security/control-access.js";
import { signAuthToken } from "../security/http-auth.js";
import type { AuditWriter } from "../services/audit.js";
import { registerConsentRoutes } from "./consent.js";

const RUN_SESSION = "workflow:run-1";

describe("plan run worker prompts over the consent routes", () => {
  let opened: Awaited<ReturnType<typeof openDatabase>>;
  let app: ReturnType<typeof Fastify>;
  let manager: ConsentManager;
  let headers: { authorization: string };
  let other: { authorization: string };

  beforeEach(async () => {
    opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    manager = new ConsentManager({ db: opened.db });
    const config = { ...loadConfig(), jwtSecret: "worker-consent-test-secret" };
    const owners = { ownerOfWorkflowSession: (sessionId: string) => (sessionId === RUN_SESSION ? "owner" : null) };
    app = Fastify();
    registerConsentRoutes(app, manager, { write: vi.fn() } as unknown as AuditWriter, {
      config,
      access: new ControlAccess(undefined, undefined, manager, undefined, owners),
    });
    headers = { authorization: "Bearer " + await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret) };
    other = { authorization: "Bearer " + await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret) };
  });

  afterEach(async () => {
    manager.cancelAll();
    await app.close();
    opened.sqlite.close();
  });

  /** A worker's tool prompt on the run's session. The returned promise settles with the decision. */
  function prompt() {
    return manager.requestConsent({
      sessionId: RUN_SESSION, actionId: "action", toolName: "terminal.run", summary: "Run the check", preview: {}, risk: "medium",
      policy: { consentLevel: "always", description: "Ask first", knownTool: true, source: "profile" },
    });
  }

  it("lists a worker prompt to the run's owner and to nobody else", async () => {
    void prompt();
    const [request] = manager.listPending(RUN_SESSION);
    const mine = await app.inject({ url: "/api/consent/pending", headers });
    expect(mine.json().requests.map((entry: { id: string }) => entry.id)).toEqual([request?.id]);
    expect((await app.inject({ url: "/api/consent/pending", headers: other })).json().requests).toEqual([]);
    expect((await app.inject({ url: "/api/consent/count", headers })).json()).toEqual({ count: 1 });
  });

  it("lets only the owner approve or refuse a worker prompt", async () => {
    const approved = prompt();
    const [first] = manager.listPending(RUN_SESSION);
    expect((await app.inject({ method: "POST", url: `/api/consent/${first?.id}/approve`, headers: other })).statusCode).toBe(404);
    expect(manager.listPending(RUN_SESSION)).toHaveLength(1);
    expect((await app.inject({ method: "POST", url: `/api/consent/${first?.id}/approve`, headers })).statusCode).toBe(200);
    await expect(approved).resolves.toMatchObject({ approved: true });

    const refused = prompt();
    const [second] = manager.listPending(RUN_SESSION);
    const rejected = await app.inject({ method: "POST", url: `/api/consent/${second?.id}/reject`, headers, payload: { reason: "not now" } });
    expect(rejected.statusCode).toBe(200);
    await expect(refused).resolves.toMatchObject({ approved: false });
  });

  it("never bulk-approves a worker session, so one approval cannot cover the run's later calls", async () => {
    void prompt();
    void prompt();
    const [first] = manager.listPending(RUN_SESSION);
    expect((await app.inject({ method: "POST", url: `/api/consent/${first?.id}/approve-all`, headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/api/consent/pending/${RUN_SESSION}/approve-all`, headers })).statusCode).toBe(404);
    expect(manager.listPending(RUN_SESSION)).toHaveLength(2);
    expect(manager.isApproveAllEnabledForSession(RUN_SESSION)).toBe(false);
  });
});
