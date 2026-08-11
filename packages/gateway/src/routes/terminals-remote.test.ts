/**
 * Integration test: POST /api/terminals with a remote nodeId
 *
 * Reproduces the "terminal won't open for a project on another node" scenario.
 * Verifies the full pipeline:
 *  1. A remote desktop node registers via WS (node.hello + fs.register-node)
 *  2. POST /api/terminals with that nodeId creates a RemoteTerminalSurface
 *  3. The gateway proxies a "start" terminal op to the remote node
 *  4. Output emitted by the remote node is broadcast to subscribed WS clients
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import * as jose from "jose";
import { loadConfig } from "../config.js";
import { createServer } from "../server.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { SessionStateService } from "../services/session-state.js";
import { ProjectService } from "../services/projects.js";
import { ProjectStateService } from "../services/project-state.js";
import { UserService } from "../services/users.js";
import { AuditWriter } from "../services/audit.js";
import { ToolRegistry } from "../tools/registry.js";
import { SurfaceRegistry, TerminalSurfaceFactory } from "../surfaces/index.js";
import { RemoteTerminalSurface } from "../surfaces/remote-terminal.js";
import { WsControlPlane } from "../ws.js";

const TEST_SECRET = "test-jwt-secret-for-remote-terminal-tests";

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}

async function createToken(sub: string): Promise<string> {
  const key = new TextEncoder().encode(TEST_SECRET);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}

function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];
  ws.on("message", (raw) => {
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
  };
}

function openWs(port: number, token: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}?token=${token}`);
  const collector = createMessageCollector(ws);
  return { ws, collector };
}

describe("POST /api/terminals with remote nodeId", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let httpPort: number;
  let surfaceRegistry: SurfaceRegistry;
  let plane: WsControlPlane;
  let token: string;
  let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];

  beforeAll(async () => {
    const config = makeConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const sessions = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const users = new UserService(db);
    const projects = new ProjectService(db);
    const projectState = new ProjectStateService(db);

    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new TerminalSurfaceFactory());

    plane = new WsControlPlane(config);

    // Mirror the production wiring in index.ts so remote terminal output is
    // broadcast to subscribed clients and input/replay are forwarded.
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "terminal" && "write" in surface) {
        (surface as { onOutput?: (data: string) => void }).onOutput = (data) =>
          plane.broadcastTerminalOutput(id, data);
      }
    };

    plane.onRemoteTerminalOutput = (terminalId, data, nodeId) => {
      const surface = surfaceRegistry.getSurface(terminalId);
      if (!(surface instanceof RemoteTerminalSurface)) return;
      const ownerNodeId = surface.snapshot().metadata.nodeId;
      if (nodeId && ownerNodeId !== nodeId) return;
      surface.ingestOutput(data);
    };
    plane.onRemoteTerminalExit = (terminalId, exitCode, signal, nodeId) => {
      const surface = surfaceRegistry.getSurface(terminalId);
      if (!(surface instanceof RemoteTerminalSurface)) return;
      const ownerNodeId = surface.snapshot().metadata.nodeId;
      if (nodeId && ownerNodeId !== nodeId) return;
      surface.ingestExit(exitCode, signal);
    };
    plane.onTerminalInput = (terminalId, data) => {
      const surface = surfaceRegistry.getSurface(terminalId);
      if (surface && surface.type === "terminal" && "write" in surface) {
        (surface as { write: (d: string) => void }).write(data);
      }
    };
    plane.onTerminalReplay = (terminalId) => {
      const surface = surfaceRegistry.getSurface(terminalId);
      if (surface && surface.type === "terminal" && "getRecentOutput" in surface) {
        return (surface as { getRecentOutput: () => string }).getRecentOutput();
      }
      return null;
    };

    const audit: AuditWriter = { write() {} } as unknown as AuditWriter;
    const toolRegistry = new ToolRegistry();

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      surfaceRegistry,
      sessionState,
      projectService: projects,
      projectState,
      audit,
      toolRegistry,
      ws: plane,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    httpPort = typeof addr === "string" ? 0 : (addr?.port ?? 0);
    expect(httpPort).toBeGreaterThan(0);

    // Attach the WS control plane to the same HTTP server (shared port).
    plane.start(app.server);

    token = await createToken("remote-terminal-test-user");
  }, 60_000);

  afterAll(async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    plane.stop();
    await app?.close();
    sqlite?.close();
  });

  it("creates a remote terminal, proxies start to the node, and broadcasts output to subscribers", async () => {
    const REMOTE_NODE_ID = "remote-terminal-node-int";

    // ── 1. Connect the remote node and register it ───────────────────
    const remote = openWs(httpPort, token);
    await waitForOpen(remote.ws);
    await remote.collector.next(); // session.created
    await new Promise((r) => setTimeout(r, 100));

    remote.ws.send(JSON.stringify({
      type: "node.hello",
      payload: {
        id: REMOTE_NODE_ID,
        name: "Remote Terminal Node",
        platform: "linux",
        role: "desktop",
        capabilities: { providers: [], surfaces: ["filesystem", "terminal"], tools: [], interactiveTerminal: true },
      },
    }));
    remote.ws.send(JSON.stringify({
      type: "fs.register-node",
      payload: { id: REMOTE_NODE_ID, name: "Remote Terminal Node", platform: "linux", providers: [] },
    }));
    // Drain registration broadcasts until the node is known to the plane.
    await new Promise((r) => setTimeout(r, 100));
    expect(plane.isRemoteNode(REMOTE_NODE_ID)).toBe(true);

    // ── 2. Subscribe a second client that will watch terminal output ─
    const viewer = openWs(httpPort, token);
    await waitForOpen(viewer.ws);
    await viewer.collector.next(); // session.created
    await new Promise((r) => setTimeout(r, 100));

    // ── 3. POST /api/terminals with the remote nodeId ────────────────
    // The remote node must answer the proxied "start" op while the request
    // is in flight, so handle it concurrently.
    const startHandled = new Promise<void>((resolve) => {
      remote.ws.once("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "terminal.op-request" && msg.payload?.op === "start") {
          const requestId = msg.payload.requestId;
          // Emit some output from the remote node (forwarded via onRemoteTerminalOutput)
          remote.ws.send(JSON.stringify({
            type: "terminal.output",
            payload: { terminalId: msg.payload.terminalId, data: "shell ready\r\n" },
          }));
          // Answer the start op so the REST call resolves.
          remote.ws.send(JSON.stringify({
            type: "terminal.op-response",
            payload: { requestId, result: { ok: true, pid: 7, shell: "/bin/bash" } },
          }));
          resolve();
        }
      });
    });

    const createRes = await fetch(`http://127.0.0.1:${httpPort}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionId: "remote-term-session", projectRoot: "/tmp", nodeId: REMOTE_NODE_ID }),
    });

    await startHandled;

    expect(createRes.ok).toBe(true);
    const info = (await createRes.json()) as { id: string; type: string; metadata: Record<string, unknown> };
    expect(info.type).toBe("terminal");
    expect(info.metadata.nodeId).toBe(REMOTE_NODE_ID);
    expect(info.metadata.remote).toBe(true);
    expect(info.state).toBe("running");

    // ── 4. The viewer subscribes to the terminal and must receive output
    viewer.ws.send(JSON.stringify({ type: "terminal.subscribe", terminalId: info.id }));

    // surface.connected (subscribed ack) comes first, then the replayed buffer.
    // Poll until we've seen both the subscription ack and the output replay.
    let gotSubscribed = false;
    let gotOutput = false;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !(gotSubscribed && gotOutput)) {
      const msg = await viewer.collector.next(Math.max(200, deadline - Date.now())).catch(() => null);
      if (!msg) break;
      if (msg.type === "surface.connected") {
        const p = msg.payload ?? {};
        if (p.subscribed === true) gotSubscribed = true;
        if (p.type === "terminal.output" && typeof p.data === "string" && p.data.includes("shell ready")) {
          gotOutput = true;
        }
      }
    }
    expect(gotSubscribed).toBe(true);
    expect(gotOutput).toBe(true);

    remote.ws.close();
    viewer.ws.close();
  }, 30_000);
});