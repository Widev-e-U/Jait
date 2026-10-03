import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket, { WebSocketServer } from "ws";
import { createServer as httpServer } from "node:http";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { UserService } from "../services/users.js";
import { NodeCredentialsService } from "../services/node-credentials.js";
import { registerAuthRoutes } from "../routes/auth.js";
import { WsControlPlane } from "../ws.js";
import { loadConfig } from "../config.js";
import { createServer } from "../server.js";
import { signAuthToken } from "./http-auth.js";
import { nodes } from "../db/schema.js";

const config = { ...loadConfig(), jwtSecret: "paired-preview-security-test", logLevel: "silent", nodeEnv: "production" };
const cleanups: Array<() => unknown> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

describe("account invitations", () => {
  it("permits initial setup and requires a single-use owner invitation for additional accounts", async () => {
    const { db, sqlite } = await openDatabase(":memory:"); migrateDatabase(sqlite);
    cleanups.push(() => sqlite.close());
    const users = new UserService(db), app = Fastify();
    await app.register(cookie); registerAuthRoutes(app, config, users); cleanups.push(() => app.close());
    const register = (username: string, invitation?: string) => app.inject({ method: "POST", url: "/api/auth/register", payload: { username, password: "test-password-only", invitation } });
    const first = await register("owner"); expect(first.statusCode).toBe(200);
    expect((await register("stranger")).statusCode).toBe(403);
    const invited = await app.inject({ method: "POST", url: "/api/auth/invitations", headers: { authorization: "Bearer " + first.json().access_token } });
    expect(invited.statusCode).toBe(200);
    const code = invited.json().invitation;
    const second = await register("friend", code); expect(second.statusCode).toBe(200);
    expect((await register("reused-code", code)).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/auth/invitations", headers: { authorization: "Bearer " + second.json().access_token } })).statusCode).toBe(403);
    expect(users.countUsers()).toBe(2);
  });
});

describe("revocable paired nodes", () => {
  it("persists hash-only credentials and confines them to the registered node", async () => {
    const { db, sqlite } = await openDatabase(":memory:"); migrateDatabase(sqlite);
    cleanups.push(() => sqlite.close());
    const now = new Date().toISOString();
    db.insert(nodes).values({ nodeId: "node-a", firstSeenAt: now, lastSeenAt: now, createdAt: now, updatedAt: now }).run();
    const credentials = new NodeCredentialsService(db);
    expect(credentials.bind("node-a", "owner")).toBe(true);
    expect(credentials.bind("node-a", "stranger")).toBe(false);
    const token = credentials.issue("node-a", "owner")!;
    expect(new NodeCredentialsService(db).resolve(token)).toEqual({ nodeId: "node-a", userId: "owner" });
    expect(sqlite.prepare("SELECT token_hash FROM node_credentials").get()).not.toEqual({ token_hash: token });
    const plane = new WsControlPlane(config, db);
    const client = { authenticated: false, userId: null, terminalSubscriptions: new Set(), ws: { send: vi.fn(), close: vi.fn(), readyState: 1 } };
    expect(await (plane as any).authenticateClient(client, token)).toBe(true);
    const input = vi.fn(); plane.onTerminalInput = input; plane.canAccessTerminal = () => true;
    await (plane as any).handleMessage(client, { type: "terminal.input", terminalId: "fake", data: "MARKER" });
    expect(input).not.toHaveBeenCalled();
    expect(credentials.revoke("node-a", "stranger")).toBe(false);
    expect(credentials.revoke("node-a", "owner")).toBe(true);
    expect(new NodeCredentialsService(db).resolve(token)).toBeNull();
    await (plane as any).handleMessage(client, { type: "fs.register-node", payload: { id: "node-a", name: "a", platform: "linux" } });
    expect(plane.getFsNodes()).toEqual([]);
  });
});

async function previewSetup(port: number, root: string) {
  const app = await createServer(config, {
    projectService: { list: (_status: unknown, user: string) => user === "owner" ? [{ rootPath: root }] : [] } as any,
    sessionService: { getById: (id: string, user: string) => id === "preview-session" && user === "owner" ? { id, userId: user } : null } as any,
    previewService: { list: () => [{ sessionId: "preview-session", status: "ready", port, projectRoot: root, remoteBrowser: { novncPort: port } }] } as any,
  });
  cleanups.push(() => app.close());
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const stranger = await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret);
  return { app, token, headers: { authorization: "Bearer " + token }, other: { authorization: "Bearer " + stranger } };
}

describe("registered previews", () => {
  it("preserves authorized proxy assets and strips gateway credentials and upstream cookies", async () => {
    let observed: import("node:http").IncomingHttpHeaders = {};
    const upstream = httpServer((req, res) => { observed = req.headers; res.setHeader("content-type", "text/javascript"); res.setHeader("set-cookie", "jait_token=evil"); res.end('export const ok = true'); });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    cleanups.push(() => new Promise<void>((resolve) => upstream.close(() => resolve())));
    const port = (upstream.address() as import("node:net").AddressInfo).port;
    const { app, token, headers, other } = await previewSetup(port, tmpdir());
    const response = await app.inject({ url: `/api/dev-proxy/${port}/main.js`, headers: { ...headers, cookie: "jait_token=" + token } });
    expect(response.statusCode).toBe(200);
    expect(observed.authorization).toBeUndefined(); expect(observed.cookie).toBeUndefined();
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect((await app.inject({ url: `/api/dev-proxy/${port}/`, headers: other })).statusCode).toBe(403);
    expect((await app.inject({ url: "/api/dev-proxy/1/", headers })).statusCode).toBe(403);
  });
  it("preserves project HTML while blocking symlink escapes and another account", async () => {
    const root = mkdtempSync(join(tmpdir(), "jait-preview-access-"));
    const outside = mkdtempSync(join(tmpdir(), "jait-preview-outside-"));
    cleanups.push(() => { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });
    const html = join(root, "index.html"); writeFileSync(html, "<html><head></head><body>preview</body></html>");
    writeFileSync(join(outside, "private.txt"), "private-marker"); symlinkSync(join(outside, "private.txt"), join(root, "escape.txt"));
    const { app, headers, other } = await previewSetup(4321, root);
    const url = "/api/dev-file/" + Buffer.from(html).toString("base64url");
    expect((await app.inject({ url, headers })).statusCode).toBe(200);
    expect((await app.inject({ url, headers: other })).statusCode).toBe(403);
    expect((await app.inject({ url: url + "/escape.txt", headers })).statusCode).toBe(403);
    const grant = await app.inject({ method: "POST", url: "/api/preview/access", headers, payload: { source: url } });
    expect(grant.statusCode).toBe(200);
    const scopedUrl = new URL(grant.json().url);
    const rendered = await app.inject({ url: scopedUrl.pathname, headers: { origin: "null" } });
    expect(rendered.statusCode).toBe(200);
    expect(rendered.headers["content-security-policy"]).toContain("sandbox");
    expect(rendered.headers["content-security-policy"]).not.toContain("allow-same-origin");
    const grantToken = scopedUrl.pathname.split("/")[2];
    expect((await app.inject({ url: "/api/filesystem/nodes", headers: { authorization: "Bearer " + grantToken } })).statusCode).toBe(401);
    expect((await app.inject({ url: scopedUrl.pathname.replace("/file/", "/proxy/") })).statusCode).toBeGreaterThanOrEqual(400);

  });
  it("rejects cross-origin cookie authority while allowing native bearer authentication", async () => {
    const { app, token, headers } = await previewSetup(4321, tmpdir());
    const evil = { origin: "https://attacker.invalid", cookie: "jait_token=" + token };
    expect((await app.inject({ url: "/api/tools", headers: evil })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/auth/refresh", headers: evil })).statusCode).toBe(403);
    expect((await app.inject({ url: "/api/filesystem/nodes", headers: { ...headers, origin: "http://tauri.localhost" } })).statusCode).toBe(200);
  });
});

it("allows a native preview WebSocket with its scoped grant and no account cookie", async () => {
  const upstream = httpServer();
  const upstreamWs = new WebSocketServer({ server: upstream });
  upstreamWs.on("connection", (socket) => socket.on("message", (data) => socket.send(data.toString())));
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => { upstreamWs.close(); return new Promise<void>((resolve) => upstream.close(() => resolve())); });
  const port = (upstream.address() as import("node:net").AddressInfo).port;
  const { app, headers } = await previewSetup(port, tmpdir());
  await app.listen({ port: 0, host: "127.0.0.1" });
  const appPort = (app.server.address() as import("node:net").AddressInfo).port;
  const grant = await app.inject({ method: "POST", url: "/api/preview/access", headers: { ...headers, host: "127.0.0.1:" + appPort },
    payload: { source: "/noVNC/vnc_lite.html?path=api/live-view/" + port + "/websockify" } });
  expect(grant.statusCode).toBe(200);
  const viewer = new URL(grant.json().url);
  const path = viewer.searchParams.get("path");
  const socket = new WebSocket("ws://127.0.0.1:" + appPort + "/" + path, { origin: "http://tauri.localhost" });
  cleanups.push(() => socket.terminate());
  await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  // Upstream connection starts after the client handshake; allow it to settle.
  await new Promise((resolve) => setTimeout(resolve, 80));
  const echo = new Promise<string>((resolve) => socket.once("message", (data) => resolve(data.toString())));
  socket.send("native-preview-marker");
  expect(await echo).toBe("native-preview-marker");
});
