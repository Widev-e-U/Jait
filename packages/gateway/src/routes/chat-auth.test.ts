import { describe, expect, it } from "vitest";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { signAuthToken } from "../security/http-auth.js";

const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};

async function authHeaders() {
  const token = await signAuthToken({ id: "chat-auth-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}

describe("chat route auth guards", () => {
  it("rejects protected chat/session endpoints without auth", async () => {
    const app = await createServer(testConfig);

    const chat = await app.inject({ method: "POST", url: "/api/chat", payload: { content: "hello", sessionId: "s1" } });
    const messages = await app.inject({ method: "GET", url: "/api/sessions/s1/messages" });
    const stream = await app.inject({ method: "GET", url: "/api/sessions/s1/stream" });
    const cancel = await app.inject({ method: "POST", url: "/api/sessions/s1/cancel" });

    expect(chat.statusCode).toBe(401);
    expect(messages.statusCode).toBe(401);
    expect(stream.statusCode).toBe(401);
    expect(cancel.statusCode).toBe(401);

    await app.close();
  });

  it("allows authenticated cancel on inactive session", async () => {
    const app = await createServer(testConfig);
    const headers = await authHeaders();

    const res = await app.inject({
      method: "POST",
      url: "/api/sessions/no-active-stream/cancel",
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, cancelled: false });

    await app.close();
  });

  it("allows authenticated stream resume and returns snapshot + done for inactive session", async () => {
    const app = await createServer(testConfig);
    const headers = await authHeaders();

    const res = await app.inject({
      method: "GET",
      url: "/api/sessions/new-session/stream",
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    const dataLines = res.body
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);

    expect(dataLines[0]).toMatchObject({ type: "snapshot", streaming: false, messages: [] });
    expect(dataLines[1]).toMatchObject({ type: "done", session_id: "new-session" });

    await app.close();
  });
});
