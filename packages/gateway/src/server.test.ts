import { describe, it, expect } from "vitest";
import { createServer } from "./server.js";
import { loadConfig } from "./config.js";

const testConfig = {
  ...loadConfig(),
  port: 0, // random port
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};

describe("@jait/gateway health", () => {
  it("GET /health returns healthy status", async () => {
    const app = await createServer(testConfig);
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.healthy).toBe(true);
    expect(body.version).toBe("0.1.0");
    expect(typeof body.uptime).toBe("number");
    await app.close();
  });

  it("GET / returns gateway info", async () => {
    const app = await createServer(testConfig);
    const response = await app.inject({
      method: "GET",
      url: "/",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.name).toBe("jait-gateway");
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.1.0");
    await app.close();
  });

  it("POST /api/chat rejects empty content", async () => {
    const app = await createServer(testConfig);
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { content: "", sessionId: "test" },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("POST /api/chat rejects missing body", async () => {
    const app = await createServer(testConfig);
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("GET /api/sessions/:id/messages returns empty for unknown session", async () => {
    const app = await createServer(testConfig);
    const response = await app.inject({
      method: "GET",
      url: "/api/sessions/unknown-session/messages",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.sessionId).toBe("unknown-session");
    expect(body.messages).toEqual([]);
    await app.close();
  });
});
