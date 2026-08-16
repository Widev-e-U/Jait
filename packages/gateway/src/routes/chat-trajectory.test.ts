import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { UserService } from "../services/users.js";
import { signAuthToken } from "../security/http-auth.js";
import { __chatTestUtils } from "./chat.js";
import type { AddressInfo } from "node:net";

const { emitToSubscribers, emitTurnDone } = __chatTestUtils;

// emitToSubscribers accepts the narrow StreamEvent union. `request` is now a
// typed union member (matching the gateway's synthetic turn-boundary event),
// but tests still build the full set of synthetic events for every stream
// type, so widen the input for brevity.
type StreamEventLike = Record<string, unknown>;
const emit = (sessionId: string, event: StreamEventLike) =>
  emitToSubscribers(sessionId, event as unknown as Parameters<typeof emitToSubscribers>[1]);

const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "trajectory-test-secret",
};

let app: Awaited<ReturnType<typeof createServer>> | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

function seedTurn(sessionId: string): void {
  emit(sessionId, { type: "request", content: "hello", provider: "jait", mode: "agent" });
  emit(sessionId, { type: "thinking", content: "let me think" });
  emit(sessionId, { type: "token", content: "Hi there" });
  emit(sessionId, { type: "tool_start", tool: "bash", args: { cmd: "ls" }, call_id: "c1" });
  emit(sessionId, { type: "tool_output", call_id: "c1", content: "file.ts" });
  emit(sessionId, { type: "tool_result", call_id: "c1", tool: "bash", ok: true, message: "ok" });
  emitTurnDone(sessionId, { type: "done", session_id: sessionId, prompt_count: 1, remaining_prompts: null } as never);
}

type TrajectoryChunk = { type: string; log_id: number; replay: boolean; payload: StreamEventLike };

function waitFor(chunks: TrajectoryChunk[], count: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (chunks.length >= count) return resolve();
      if (Date.now() > deadline) return reject(new Error(`timed out waiting for ${count} events (got ${chunks.length})`));
      setTimeout(poll, 10);
    };
    poll();
  });
}

async function collectEvents(
  url: string,
  token: string,
): Promise<{ chunks: TrajectoryChunk[]; abort: () => void }> {
  const controller = new AbortController();
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
  expect(res.status).toBe(200);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const chunks: TrajectoryChunk[] = [];
  void (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6)) as TrajectoryChunk;
          if (data.type !== "trajectory_event") continue;
          chunks.push(data);
        }
      }
    } catch {
      // aborted by the test — expected
    }
  })();
  return { chunks, abort: () => controller.abort() };
}

async function setup(): Promise<{ sessionId: string; token: string; url: string }> {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const sessionService = new SessionService(db);
  const userService = new UserService(db);
  const user = userService.createUser("traj-live-user", "password123");
  const session = sessionService.create({ userId: user.id, name: "Trajectory" });

  app = await createServer(testConfig, { db, sqlite, sessionService, userService });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address() as AddressInfo;
  const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
  const url = `http://127.0.0.1:${address.port}/api/sessions/${session.id}/trajectory`;
  return { sessionId: session.id, token, url };
}

describe("session trajectory endpoint", () => {
  it("rejects without auth", async () => {
    const standalone = await createServer(testConfig);
    try {
      const res = await standalone.inject({ method: "GET", url: "/api/sessions/traj/trajectory" });
      expect(res.statusCode).toBe(401);
    } finally {
      await standalone.close();
    }
  });

  it("returns 404 for an unknown session", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const sessionService = new SessionService(db);
    const userService = new UserService(db);
    userService.createUser("traj-user", "password123");

    app = await createServer(testConfig, { db, sqlite, sessionService, userService });
    const token = await signAuthToken({ id: "traj-user", username: "traj-user" }, testConfig.jwtSecret);

    const res = await app.inject({
      method: "GET",
      url: "/api/sessions/does-not-exist/trajectory",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("replays the persisted event log then streams live events in log_id order", async () => {
    const { sessionId, token, url } = await setup();
    // Seed a completed turn before any client connects, so it must be served
    // from the persisted log (old data).
    seedTurn(sessionId);

    const { chunks, abort } = await collectEvents(url, token);
    // Replay: the 7 pre-seeded events arrive first, in order.
    await waitFor(chunks, 7);
    const replay = chunks.slice(0, 7);
    expect(replay.map((e) => e.payload.type)).toEqual([
      "request", "thinking", "token", "tool_start", "tool_output", "tool_result", "done",
    ]);
    expect(replay.map((e) => e.log_id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(replay.every((e) => e.replay === true)).toBe(true);

    // Live: an event emitted after connect arrives with the next log_id.
    emit(sessionId, { type: "token", content: " live chunk" });
    await waitFor(chunks, 8);
    const live = chunks[7]!;
    expect(live.log_id).toBe(8);
    expect(live.replay).toBe(false);
    expect(live.payload.type).toBe("token");
    expect(live.payload.content).toBe(" live chunk");

    abort();
  });

  it("replays events that were persisted while no client was connected", async () => {
    const { sessionId, token, url } = await setup();
    // Nothing connected yet — emit a turn as a background turn would.
    seedTurn(sessionId);

    // A later connection still sees the full history.
    const { chunks, abort } = await collectEvents(url, token);
    await waitFor(chunks, 7);
    expect(chunks.map((e) => e.payload.type)).toEqual([
      "request", "thinking", "token", "tool_start", "tool_output", "tool_result", "done",
    ]);
    abort();
  });
});
