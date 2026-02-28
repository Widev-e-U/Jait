import { describe, it, expect, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";
import * as jose from "jose";
import { WsControlPlane } from "./ws.js";
import type { AppConfig } from "./config.js";

const TEST_SECRET = "test-jwt-secret-for-ws-tests";

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
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

async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

/** Collects WS messages into a queue so we never miss one */
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
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
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
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

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}

function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}

describe("WsControlPlane", () => {
  let plane: WsControlPlane;
  let port: number;

  beforeEach(() => {
    const config = makeConfig({ wsPort: 0 });
    plane = new WsControlPlane(config);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    expect(port).toBeGreaterThan(0);
  });

  afterEach(() => {
    plane.stop();
  });

  it("accepts connection and sends session.created on connect", async () => {
    const { ws, collector } = openWs(port);
    await waitForOpen(ws);

    const msg = await collector.next();
    expect(msg.type).toBe("session.created");
    expect(msg.payload.clientId).toBeTruthy();
    ws.close();
  });

  it("clientCount increments and decrements on connect/disconnect", async () => {
    expect(plane.clientCount).toBe(0);

    const { ws, collector } = openWs(port);
    await waitForOpen(ws);
    await collector.next(); // consume session.created

    expect(plane.clientCount).toBe(1);

    ws.close();
    await new Promise((r) => setTimeout(r, 150));
    expect(plane.clientCount).toBe(0);
  });

  describe("authentication", () => {
    it("authenticates via query-string token (async — verified by subscribe)", async () => {
      // authenticateClient is async and non-awaited in the connection handler,
      // so the initial session.created may show authenticated=false.
      // We verify auth completed by successfully subscribing.
      const token = await createToken("user-1");
      const { ws, collector } = openWs(port, { token });
      await waitForOpen(ws);

      await collector.next(); // initial session.created (may be false)

      // Give the async auth time to complete
      await new Promise((r) => setTimeout(r, 100));

      // Subscribe should succeed (no UNAUTHORIZED error)
      ws.send(JSON.stringify({ type: "subscribe", sessionId: "s1" }));
      const subMsg = await collector.next();
      expect(subMsg.type).toBe("session.created");
      expect(subMsg.payload.subscribed).toBe(true);
      ws.close();
    });

    it("authenticates via Authorization header (async — verified by subscribe)", async () => {
      const token = await createToken("user-2");
      const { ws, collector } = openWs(port, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await waitForOpen(ws);

      await collector.next(); // initial session.created

      await new Promise((r) => setTimeout(r, 100));

      ws.send(JSON.stringify({ type: "subscribe", sessionId: "s2" }));
      const subMsg = await collector.next();
      expect(subMsg.type).toBe("session.created");
      expect(subMsg.payload.subscribed).toBe(true);
      ws.close();
    });

    it("authenticates via 'authenticate' message", async () => {
      const token = await createToken("user-3");
      const { ws, collector } = openWs(port);
      await waitForOpen(ws);

      const initial = await collector.next();
      expect(initial.type).toBe("session.created");
      expect(initial.payload.authenticated).toBe(false);

      // Send authenticate message
      ws.send(JSON.stringify({ type: "authenticate", token }));
      const authMsg = await collector.next();
      expect(authMsg.type).toBe("session.created");
      expect(authMsg.payload.authenticated).toBe(true);
      expect(authMsg.payload.userId).toBe("user-3");
      ws.close();
    });

    it("rejects invalid token in non-dev mode", async () => {
      const { ws } = openWs(port, { token: "bad-token" });
      await waitForOpen(ws);

      await new Promise<void>((resolve) => {
        ws.on("close", () => resolve());
        if (ws.readyState === WebSocket.CLOSED) resolve();
        setTimeout(resolve, 2000);
      });
      expect(ws.readyState).toBe(WebSocket.CLOSED);
    });

    it("allows unauthenticated connection in dev mode", async () => {
      plane.stop();
      const devConfig = makeConfig({ nodeEnv: "development", wsPort: 0 });
      plane = new WsControlPlane(devConfig);
      plane.start();
      const devAddr = (plane as any).wss?.address();
      const devPort = typeof devAddr === "object" ? devAddr.port : 0;

      const { ws, collector } = openWs(devPort);
      await waitForOpen(ws);

      const msg = await collector.next();
      expect(msg.type).toBe("session.created");
      expect(msg.payload.authenticated).toBe(true);
      ws.close();
    });
  });

  describe("subscribe", () => {
    it("rejects subscribe when not authenticated (non-dev mode)", async () => {
      const { ws, collector } = openWs(port);
      await waitForOpen(ws);
      await collector.next(); // consume session.created

      ws.send(JSON.stringify({ type: "subscribe", sessionId: "s1" }));
      const msg = await collector.next();
      expect(msg.type).toBe("error");
      expect(msg.payload.code).toBe("UNAUTHORIZED");
      ws.close();
    });

    it("allows subscribe after authentication", async () => {
      const token = await createToken("user-sub");
      const { ws, collector } = openWs(port, { token });
      await waitForOpen(ws);
      await collector.next(); // initial session.created

      // Wait for async token auth to complete
      await new Promise((r) => setTimeout(r, 100));

      ws.send(
        JSON.stringify({
          type: "subscribe",
          sessionId: "session-123",
          deviceId: "dev-1",
        }),
      );
      const msg = await collector.next();
      expect(msg.type).toBe("session.created");
      expect(msg.payload.subscribed).toBe(true);
      expect(msg.sessionId).toBe("session-123");
      ws.close();
    });
  });

  describe("broadcast", () => {
    it("broadcasts to subscribed clients only", async () => {
      const token = await createToken("user-b");

      // Client 1 → session-a
      const c1 = openWs(port, { token });
      await waitForOpen(c1.ws);
      await c1.collector.next();
      await new Promise((r) => setTimeout(r, 100));
      c1.ws.send(JSON.stringify({ type: "subscribe", sessionId: "session-a" }));
      await c1.collector.next(); // subscribe ack

      // Client 2 → session-b
      const c2 = openWs(port, { token });
      await waitForOpen(c2.ws);
      await c2.collector.next();
      await new Promise((r) => setTimeout(r, 100));
      c2.ws.send(JSON.stringify({ type: "subscribe", sessionId: "session-b" }));
      await c2.collector.next(); // subscribe ack

      // Broadcast to session-a
      plane.broadcast("session-a", {
        type: "action.started",
        sessionId: "session-a",
        timestamp: new Date().toISOString(),
        payload: { msg: "hello" },
      });

      // ws1 should get the message
      const received = await c1.collector.next();
      expect(received.type).toBe("action.started");
      expect(received.payload.msg).toBe("hello");

      // ws2 should NOT get a message
      const noMsg = await c2.collector.maybeNext(500);
      expect(noMsg).toBeNull();

      c1.ws.close();
      c2.ws.close();
    });

    it("broadcastAll sends to all connected clients", async () => {
      const token = await createToken("user-all");

      const c1 = openWs(port, { token });
      await waitForOpen(c1.ws);
      await c1.collector.next();

      const c2 = openWs(port, { token });
      await waitForOpen(c2.ws);
      await c2.collector.next();

      plane.broadcastAll({
        type: "session.updated",
        sessionId: "",
        timestamp: new Date().toISOString(),
        payload: { broadcast: true },
      });

      const [msg1, msg2] = await Promise.all([
        c1.collector.next(),
        c2.collector.next(),
      ]);
      expect(msg1.payload.broadcast).toBe(true);
      expect(msg2.payload.broadcast).toBe(true);

      c1.ws.close();
      c2.ws.close();
    });
  });


  describe("consent messages", () => {
    it("routes consent.approve to onConsentApprove callback", async () => {
      const token = await createToken("user-consent-approve");
      const onApprove = new Promise<string>((resolve) => {
        plane.onConsentApprove = (requestId) => resolve(requestId);
      });

      const { ws, collector } = openWs(port, { token });
      await waitForOpen(ws);
      await collector.next();
      await new Promise((r) => setTimeout(r, 100));

      ws.send(JSON.stringify({ type: "consent.approve", requestId: "req-1" }));
      await expect(onApprove).resolves.toBe("req-1");
      ws.close();
    });

    it("routes consent.reject to onConsentReject callback with reason", async () => {
      const token = await createToken("user-consent-reject");
      const onReject = new Promise<{ requestId: string; reason?: string }>((resolve) => {
        plane.onConsentReject = (requestId, reason) => resolve({ requestId, reason });
      });

      const { ws, collector } = openWs(port, { token });
      await waitForOpen(ws);
      await collector.next();
      await new Promise((r) => setTimeout(r, 100));

      ws.send(JSON.stringify({ type: "consent.reject", requestId: "req-2", reason: "No" }));
      await expect(onReject).resolves.toEqual({ requestId: "req-2", reason: "No" });
      ws.close();
    });
  });

  describe("error handling", () => {
    it("returns error for invalid JSON", async () => {
      const token = await createToken("user-err");
      const { ws, collector } = openWs(port, { token });
      await waitForOpen(ws);
      await collector.next();
      await new Promise((r) => setTimeout(r, 100));

      ws.send("not valid json{{{");
      const msg = await collector.next();
      expect(msg.type).toBe("error");
      expect(msg.payload.message).toBe("Invalid JSON");
      ws.close();
    });

    it("returns error for unknown message type", async () => {
      const token = await createToken("user-unk");
      const { ws, collector } = openWs(port, { token });
      await waitForOpen(ws);
      await collector.next();
      await new Promise((r) => setTimeout(r, 100));

      ws.send(JSON.stringify({ type: "nonexistent.action" }));
      const msg = await collector.next();
      expect(msg.type).toBe("error");
      expect(msg.payload.message).toContain("Unknown message type");
      ws.close();
    });
  });
});
