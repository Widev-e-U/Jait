import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { signAuthToken } from "./http-auth.js";
import { SurfaceRegistry } from "../surfaces/registry.js";
import { DeviceRegistry } from "../services/device-registry.js";
import { ToolRegistry } from "../tools/registry.js";
import { WsControlPlane } from "../ws.js";

const config = { ...loadConfig(), jwtSecret: "control-access-regression-secret", nodeEnv: "production", logLevel: "silent" };
const apps: Array<Awaited<ReturnType<typeof createServer>>> = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

async function setup() {
  const write = vi.fn();
  const surfaces = new SurfaceRegistry();
  const snapshot = { id: "fake-terminal", type: "terminal", state: "running", sessionId: "owner-session", metadata: {} };
  surfaces.registerInstance("fake-terminal", { id: snapshot.id, type: "terminal", sessionId: snapshot.sessionId,
    state: "running", snapshot: () => snapshot, write, resize: vi.fn() } as any);
  const approve = vi.fn(() => true);
  const consentManager = { getRequest: () => ({ id: "pending", status: "pending", sessionId: "owner-session" }), approve, listPending: () => [], reject: vi.fn(() => true) } as any;
  const app = await createServer(config, { consentManager, deviceRegistry: new DeviceRegistry(), surfaceRegistry: surfaces, toolRegistry: new ToolRegistry(),
    audit: { write: vi.fn() } as any,
    sessionService: { getById: (id: string, user?: string) => id === "owner-session" && (!user || user === "owner") ? { id, userId: "owner" } : null } as any });
  apps.push(app);
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const other = await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret);
  return { app, write, approve, headers: { authorization: `Bearer ${token}` }, other: { authorization: `Bearer ${other}` } };
}

describe("terminal authorization", () => {
  it("rejects anonymous writes before reaching the terminal", async () => {
    const { app, write } = await setup();
    const r = await app.inject({ method: "POST", url: "/api/terminals/fake-terminal/write", payload: { data: "MARKER" } });
    expect(r.statusCode).toBe(401);
    expect(write).not.toHaveBeenCalled();
  });
  it("hides another account's terminals and rejects input", async () => {
    const { app, write, other } = await setup();
    const r = await app.inject({ method: "POST", url: "/api/terminals/fake-terminal/write", headers: other, payload: { data: "MARKER" } });
    expect(r.statusCode).toBe(404);
    expect(write).not.toHaveBeenCalled();
    const list = await app.inject({ url: "/api/terminals", headers: other });
    expect(list.json().terminals).toEqual([]);
  });
  it("preserves the owner's terminal input", async () => {
    const { app, write, headers } = await setup();
    const r = await app.inject({ method: "POST", url: "/api/terminals/fake-terminal/write", headers, payload: { data: "MARKER" } });
    expect(r.statusCode).toBe(200);
    expect(write).toHaveBeenCalledWith("MARKER");
  });
});

describe("WebSocket control authorization", () => {
  it.each(["production", "development"])("rejects anonymous control in %s", async (nodeEnv) => {
    const plane = new WsControlPlane({ ...config, nodeEnv });
    const input = vi.fn(), approval = vi.fn(), send = vi.fn();
    plane.onTerminalInput = input; plane.onConsentApprove = approval;
    const client = { authenticated: false, userId: null, ws: { readyState: 1, send } };
    await (plane as any).handleMessage(client, { type: "terminal.input", terminalId: "fake", data: "MARKER" });
    await (plane as any).handleMessage(client, { type: "consent.approve", requestId: "fake" });
    expect(input).not.toHaveBeenCalled(); expect(approval).not.toHaveBeenCalled();
    expect(JSON.parse(send.mock.calls[0]![0]).payload.code).toBe("UNAUTHORIZED");
  });
  it("checks ownership and preserves authorized control", async () => {
    const plane = new WsControlPlane(config);
    const input = vi.fn(), approval = vi.fn();
    plane.onTerminalInput = input; plane.onConsentApprove = approval;
    plane.canAccessTerminal = (_id, user) => user === "owner";
    plane.canAccessConsent = (_id, user) => user === "owner";
    const client = (userId: string) => ({ authenticated: true, userId, ws: { readyState: 1, send: vi.fn() } });
    for (const user of ["stranger", "owner"]) {
      await (plane as any).handleMessage(client(user), { type: "terminal.input", terminalId: "fake", data: "MARKER" });
      await (plane as any).handleMessage(client(user), { type: "consent.approve", requestId: "fake" });
    }
    expect(input).toHaveBeenCalledTimes(1); expect(approval).toHaveBeenCalledTimes(1);
  });
});

it("rejects anonymous previews and filesystem access", async () => {
  const { app } = await setup();
  for (const url of ["/api/dev-proxy/1/", "/api/dev-file/fake", "/api/filesystem/browse?path=/tmp", "/api/consent/pending"]) {
    const r = await app.inject({ url });
    expect(r.statusCode).toBe(401);
  }
});


it("protects mobile consent approvals with the same ownership policy", async () => {
  const { app, headers, other, approve } = await setup();
  const url = "/api/mobile/consent/pending/approve";
  expect((await app.inject({ method: "POST", url })).statusCode).toBe(401);
  expect((await app.inject({ method: "POST", url, headers: other })).statusCode).toBe(404);
  expect(approve).not.toHaveBeenCalled();
  expect((await app.inject({ method: "POST", url, headers })).statusCode).toBe(200);
  expect(approve).toHaveBeenCalledTimes(1);
});
