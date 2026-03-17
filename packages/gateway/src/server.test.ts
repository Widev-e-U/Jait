import { describe, it, expect } from "vitest";
import { createServer } from "./server.js";
import { loadConfig } from "./config.js";
import { signAuthToken } from "./security/http-auth.js";
import { resolve } from "node:path";

const testConfig = {
  ...loadConfig(),
  port: 0, // random port
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "development",
};



async function createAuthedServer() {
  const app = await createServer(testConfig);
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  const headers = { authorization: `Bearer ${token}` };
  return { app, headers };
}

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
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof body.uptime).toBe("number");
    await app.close();
  });

  it("GET / returns web UI or gateway info", async () => {
    const app = await createServer(testConfig);
    const response = await app.inject({
      method: "GET",
      url: "/",
    });

    expect(response.statusCode).toBe(200);
    const contentType = response.headers["content-type"] ?? "";
    if (String(contentType).includes("text/html")) {
      // Web dist is present — SPA is served
      expect(response.body).toContain("<!DOCTYPE");
    } else {
      // No web dist — JSON fallback
      const body = JSON.parse(response.body);
      expect(body.name).toBe("jait-gateway");
      expect(body.status).toBe("ok");
      expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
    await app.close();
  });

  it("POST /api/chat rejects empty content", async () => {
    const { app, headers } = await createAuthedServer();
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: { content: "", sessionId: "test" },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("POST /api/chat rejects missing body", async () => {
    const { app, headers } = await createAuthedServer();
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("GET /api/sessions/:id/messages returns empty for unknown session", async () => {
    const { app, headers } = await createAuthedServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/sessions/unknown-session/messages",
      headers,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.sessionId).toBe("unknown-session");
    expect(body.messages).toEqual([]);
    await app.close();
  });

  it("GET /api/dev-file serves workspace html previews with rewritten asset paths", async () => {
    const app = await createServer(testConfig);
    const encodedPath = Buffer.from(resolve("docs/site/index.html"), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    const response = await app.inject({
      method: "GET",
      url: `/api/dev-file/${encodedPath}`,
    });

    expect(response.statusCode).toBe(200);
    expect(String(response.headers["content-type"])).toContain("text/html");
    expect(response.body).toContain(`<base href="/api/dev-file/${encodedPath}/">`);
    expect(response.body).toContain(`/api/dev-file/${encodedPath}/icon.svg`);

    const assetResponse = await app.inject({
      method: "GET",
      url: `/api/dev-file/${encodedPath}/icon.svg`,
    });

    expect(assetResponse.statusCode).toBe(200);
    expect(String(assetResponse.headers["content-type"])).toContain("image/svg+xml");
    await app.close();
  });
});
