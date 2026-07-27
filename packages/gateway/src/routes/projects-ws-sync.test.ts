/**
 * Integration test: project/chat WS broadcast sync.
 *
 * Verifies that project and chat (session) mutations broadcast
 * `project.*` / `chat.*` events over WS to the mutating user's other
 * connected clients — and never leak to a different user's clients.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";
import { loadConfig } from "../config.js";
import { createServer } from "../server.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { ProjectService } from "../services/projects.js";
import { UserService } from "../services/users.js";
import { AuditWriter } from "../services/audit.js";
import { signAuthToken } from "../security/http-auth.js";
import { WsControlPlane } from "../ws.js";

const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};

async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

/** Collects WS messages into a queue so we never miss one delivered before we start waiting. */
function createMessageCollector(socket: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];
  socket.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  return {
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("WS message timeout")), ms);
        waiters.push((msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });
    },
    async maybeNext(ms = 400): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), ms);
        waiters.push((msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });
    },
  };
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) return resolve();
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}

async function connectClient(port: number, token: string) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}?token=${token}`);
  const collector = createMessageCollector(socket);
  await waitForOpen(socket);
  // Drain the initial `session.created` handshake ack — unrelated to app events.
  await collector.next();
  return { socket, collector };
}

/** Skips any events unrelated to our test (fs.node-*, etc.) and returns the next `project.`/`chat.` event. */
async function nextAppEvent(collector: ReturnType<typeof createMessageCollector>, ms = 3000): Promise<any> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const msg = await collector.next(ms);
    if (typeof msg?.type === "string" && (msg.type.startsWith("project.") || msg.type.startsWith("chat."))) {
      return msg;
    }
  }
  throw new Error("Timed out waiting for a project./chat. WS event");
}

describe("project/chat WS broadcast sync", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let address: string;
  let ws: WsControlPlane;
  let wsPort: number;
  let userService: UserService;

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    ws = new WsControlPlane(testConfig);
    ws.start();
    const addr = (ws as any).wss?.address();
    wsPort = typeof addr === "object" ? addr.port : 0;
    expect(wsPort).toBeGreaterThan(0);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      userService,
      audit,
      ws,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const httpAddr = app.server.address();
    address = typeof httpAddr === "string" ? httpAddr : `http://127.0.0.1:${httpAddr?.port}`;
  });

  afterEach(async () => {
    ws.stop();
    await app.close();
  });

  it("broadcasts project.created/updated to the same user's other client, and to no one else", async () => {
    const userA = userService.createUser(`sync-user-a-${Date.now()}`, "password123");
    const userB = userService.createUser(`sync-user-b-${Date.now()}`, "password123");
    const tokenA1 = await signAuthToken({ id: userA.id, username: userA.username }, testConfig.jwtSecret);
    const tokenA2 = await signAuthToken({ id: userA.id, username: userA.username }, testConfig.jwtSecret);
    const tokenB = await signAuthToken({ id: userB.id, username: userB.username }, testConfig.jwtSecret);

    const clientA1 = await connectClient(wsPort, tokenA1);
    const clientA2 = await connectClient(wsPort, tokenA2);
    const clientB = await connectClient(wsPort, tokenB);

    const headersA = await authHeaders(userA.id, userA.username, testConfig.jwtSecret);
    const createRes = await fetch(`${address}/api/projects`, {
      method: "POST",
      headers: { ...headersA, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Live Sync Project", rootPath: "/repo/live-sync" }),
    });
    expect(createRes.status).toBe(201);
    const project = await createRes.json() as { id: string; title: string };

    // The creating client's own tab also receives its broadcast (dedupe is the frontend's job).
    const eventA1 = await nextAppEvent(clientA1.collector);
    expect(eventA1.type).toBe("project.created");
    expect(eventA1.payload.project.id).toBe(project.id);
    expect(eventA1.payload.project.title).toBe("Live Sync Project");

    // A second device signed in as the same user sees it too.
    const eventA2 = await nextAppEvent(clientA2.collector);
    expect(eventA2.type).toBe("project.created");
    expect(eventA2.payload.project.id).toBe(project.id);

    // A different user must never see it.
    const leaked = await clientB.collector.maybeNext(500);
    expect(leaked).toBeNull();

    // Renaming the project broadcasts project.updated with the new title.
    const patchRes = await fetch(`${address}/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { ...headersA, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Renamed Project" }),
    });
    expect(patchRes.status).toBe(200);

    const updateEvent = await nextAppEvent(clientA2.collector);
    expect(updateEvent.type).toBe("project.updated");
    expect(updateEvent.payload.project.title).toBe("Renamed Project");

    clientA1.socket.close();
    clientA2.socket.close();
    clientB.socket.close();
  });

  it("broadcasts chat.created for a project's first chat, then chat.updated/archived/deleted", async () => {
    const user = userService.createUser(`sync-chat-user-${Date.now()}`, "password123");
    const tokenSelf = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const tokenOther = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const clientSelf = await connectClient(wsPort, tokenSelf);
    const clientOther = await connectClient(wsPort, tokenOther);
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const projectRes = await fetch(`${address}/api/projects`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Chat Sync Project" }),
    });
    const project = await projectRes.json() as { id: string };
    // Drain the project.created broadcast from both sockets before moving on.
    await nextAppEvent(clientSelf.collector);
    await nextAppEvent(clientOther.collector);

    // Create the project's FIRST (and only) chat — this is the exact scenario
    // that used to be invisible in the sidebar due to the `> 1` bug.
    const createSessionRes = await fetch(`${address}/api/projects/${project.id}/sessions`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "First chat" }),
    });
    expect(createSessionRes.status).toBe(201);
    const session = await createSessionRes.json() as { id: string; name: string };

    const createdEvent = await nextAppEvent(clientOther.collector);
    expect(createdEvent.type).toBe("chat.created");
    expect(createdEvent.payload.projectId).toBe(project.id);
    expect(createdEvent.payload.session.id).toBe(session.id);
    expect(createdEvent.payload.session.name).toBe("First chat");

    // Rename via /api/sessions/:id
    const renameRes = await fetch(`${address}/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed chat" }),
    });
    expect(renameRes.status).toBe(200);
    const updatedEvent = await nextAppEvent(clientOther.collector);
    expect(updatedEvent.type).toBe("chat.updated");
    expect(updatedEvent.payload.projectId).toBe(project.id);
    expect(updatedEvent.payload.session.name).toBe("Renamed chat");

    // Archive
    const archiveRes = await fetch(`${address}/api/sessions/${session.id}/archive`, {
      method: "POST",
      headers,
    });
    expect(archiveRes.status).toBe(200);
    const archivedEvent = await nextAppEvent(clientOther.collector);
    expect(archivedEvent.type).toBe("chat.archived");
    expect(archivedEvent.payload.sessionId).toBe(session.id);
    expect(archivedEvent.payload.projectId).toBe(project.id);

    // Create a standalone (project-less) chat and hard-delete it.
    const personalRes = await fetch(`${address}/api/sessions`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Personal chat" }),
    });
    const personal = await personalRes.json() as { id: string };
    const personalCreatedEvent = await nextAppEvent(clientOther.collector);
    expect(personalCreatedEvent.type).toBe("chat.created");
    expect(personalCreatedEvent.payload.projectId).toBeNull();

    const deleteRes = await fetch(`${address}/api/sessions/${personal.id}`, {
      method: "DELETE",
      headers,
    });
    expect(deleteRes.status).toBe(200);
    const deletedEvent = await nextAppEvent(clientOther.collector);
    expect(deletedEvent.type).toBe("chat.deleted");
    expect(deletedEvent.payload.sessionId).toBe(personal.id);
    expect(deletedEvent.payload.projectId).toBeNull();

    clientSelf.socket.close();
    clientOther.socket.close();
  });

  it("broadcasts project.deleted on archive and project.restored on restore", async () => {
    const user = userService.createUser(`sync-restore-user-${Date.now()}`, "password123");
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const client = await connectClient(wsPort, token);
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const projectRes = await fetch(`${address}/api/projects`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Restorable Project" }),
    });
    const project = await projectRes.json() as { id: string };
    await nextAppEvent(client.collector); // project.created

    const deleteRes = await fetch(`${address}/api/projects/${project.id}`, {
      method: "DELETE",
      headers,
    });
    expect(deleteRes.status).toBe(204);
    const deletedEvent = await nextAppEvent(client.collector);
    expect(deletedEvent.type).toBe("project.deleted");
    expect(deletedEvent.payload.projectId).toBe(project.id);

    const restoreRes = await fetch(`${address}/api/projects/${project.id}/restore`, {
      method: "POST",
      headers,
    });
    expect(restoreRes.status).toBe(200);
    const restoredEvent = await nextAppEvent(client.collector);
    expect(restoredEvent.type).toBe("project.restored");
    expect(restoredEvent.payload.project.id).toBe(project.id);

    client.socket.close();
  });
});
