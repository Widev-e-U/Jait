import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "./server.js";
import { loadConfig } from "./config.js";
import { signAuthToken } from "./security/http-auth.js";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createHttpServer } from "node:http";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

  // Create temp fixtures inside cwd so they pass the isPathWithin(cwd) check
  let devFileFixtureDir: string;
  let devFileHtml: string;
  let devFileSvg: string;

  beforeAll(() => {
    devFileFixtureDir = mkdtempSync(join(process.cwd(), ".tmp-dev-file-test-"));
    devFileHtml = join(devFileFixtureDir, "preview.html");
    devFileSvg = join(devFileFixtureDir, "icon.svg");
    writeFileSync(devFileHtml, '<!DOCTYPE html>\n<html><head><title>Test</title></head>\n<body><img src="/icon.svg" /></body>\n</html>\n');
    writeFileSync(devFileSvg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>\n');
  });

  afterAll(() => {
    rmSync(devFileFixtureDir, { recursive: true, force: true });
  });

  it("GET /api/dev-file serves workspace html previews with rewritten asset paths", async () => {
    const app = await createServer(testConfig);
    // Encode relative path from cwd — avoids platform-specific absolute path issues
    const relPath = relative(process.cwd(), devFileHtml);
    const encodedPath = Buffer.from(relPath, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    const response = await app.inject({
      method: "GET",
      url: `/api/dev-file/${encodedPath}`,
    });

    expect(response.statusCode, `dev-file response: ${response.body}`).toBe(200);
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

  it("GET /api/dev-file accepts relative workspace html paths", async () => {
    const app = await createServer(testConfig);
    const relPath = relative(process.cwd(), devFileHtml);
    const encodedPath = Buffer.from(relPath, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    const response = await app.inject({
      method: "GET",
      url: `/api/dev-file/${encodedPath}`,
    });

    expect(response.statusCode, `dev-file response: ${response.body}`).toBe(200);
    expect(String(response.headers["content-type"])).toContain("text/html");
    await app.close();
  });

  it("GET /api/dev-proxy rewrites vite absolute module paths", async () => {
    const upstream = createHttpServer((request, response) => {
      if (request.url === "/") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end('<!DOCTYPE html><html><head></head><body><script type="module" src="/@vite/client"></script><script type="module" src="/src/main.tsx"></script></body></html>');
        return;
      }

      if (request.url === "/src/main.tsx") {
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        response.end('import "/@fs/home/user/project/node_modules/vite/dist/client/env.mjs"; import "/node_modules/.vite/deps/react.js?v=1";');
        return;
      }

      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("not found");
    });

    await new Promise<void>((resolveListen) => upstream.listen(0, "127.0.0.1", () => resolveListen()));
    const address = upstream.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP address for upstream test server");
    }

    const app = await createServer(testConfig);
    const response = await app.inject({
      method: "GET",
      url: `/api/dev-proxy/${address.port}/src/main.tsx`,
    });

    expect(response.statusCode).toBe(200);
    expect(String(response.headers["content-type"])).toContain("text/javascript");
    expect(response.body).toContain(`"/api/dev-proxy/${address.port}/@fs/home/user/project/node_modules/vite/dist/client/env.mjs"`);
    expect(response.body).toContain(`"/api/dev-proxy/${address.port}/node_modules/.vite/deps/react.js?v=1"`);

    const htmlResponse = await app.inject({
      method: "GET",
      url: `/api/dev-proxy/${address.port}/`,
    });

    expect(htmlResponse.statusCode).toBe(200);
    expect(htmlResponse.body).not.toContain("/@vite/client");
    expect(htmlResponse.body).toContain(`/api/dev-proxy/${address.port}/src/main.tsx`);

    await app.close();
    await new Promise<void>((resolveClose, rejectClose) => upstream.close((error) => error ? rejectClose(error) : resolveClose()));
  });

  it("GET /api/dev-proxy retries transient vite dep 504 responses", async () => {
    let attempts = 0;
    const upstream = createHttpServer((request, response) => {
      if (request.url?.startsWith("/node_modules/.vite/deps/react.js")) {
        attempts += 1;
        if (attempts === 1) {
          response.writeHead(504, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Outdated Optimize Dep");
          return;
        }
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        response.end("export default 'ok';");
        return;
      }

      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("not found");
    });

    await new Promise<void>((resolveListen) => upstream.listen(0, "127.0.0.1", () => resolveListen()));
    const address = upstream.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP address for upstream test server");
    }

    const app = await createServer(testConfig);
    const response = await app.inject({
      method: "GET",
      url: `/api/dev-proxy/${address.port}/node_modules/.vite/deps/react.js?v=1`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("export default 'ok';");
    expect(attempts).toBe(2);

    await app.close();
    await new Promise<void>((resolveClose, rejectClose) => upstream.close((error) => error ? rejectClose(error) : resolveClose()));
  });

  it("GET /api/dev-proxy/:port proxies and rewrites HTML and JS", async () => {
    const upstream = createHttpServer((request, response) => {
      if (request.url === "/") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end('<!DOCTYPE html><html><body><script type="module" src="/src/main.tsx"></script></body></html>');
        return;
      }

      if (request.url === "/src/main.tsx") {
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        response.end('import "/@vite/client"; console.log("ok");');
        return;
      }

      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("not found");
    });

    await new Promise<void>((resolveListen) => upstream.listen(0, "127.0.0.1", () => resolveListen()));
    const address = upstream.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP address for upstream test server");
    }

    const app = await createServer(testConfig);

    const htmlResponse = await app.inject({
      method: "GET",
      url: `/api/dev-proxy/${address.port}/`,
    });

    expect(htmlResponse.statusCode).toBe(200);
    expect(htmlResponse.body).toContain(`/api/dev-proxy/${address.port}/src/main.tsx`);

    const moduleResponse = await app.inject({
      method: "GET",
      url: `/api/dev-proxy/${address.port}/src/main.tsx`,
    });

    expect(moduleResponse.statusCode).toBe(200);
    expect(moduleResponse.body).toContain(`/api/dev-proxy/${address.port}/@vite/client`);

    await app.close();
    await new Promise<void>((resolveClose, rejectClose) => upstream.close((error) => error ? rejectClose(error) : resolveClose()));
  });

  it("GET /api/dev-proxy rejects html fallback for module requests", async () => {
    const upstream = createHttpServer((request, response) => {
      if (request.url?.startsWith("/src/main.tsx")) {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end("<!DOCTYPE html><html><body>spa fallback</body></html>");
        return;
      }

      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("not found");
    });

    await new Promise<void>((resolveListen) => upstream.listen(0, "127.0.0.1", () => resolveListen()));
    const address = upstream.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP address for upstream test server");
    }

    const app = await createServer(testConfig);
    const response = await app.inject({
      method: "GET",
      url: `/api/dev-proxy/${address.port}/src/main.tsx`,
    });

    expect(response.statusCode).toBe(502);
    expect(String(response.headers["content-type"])).toContain("application/json");
    expect(response.json()).toEqual({
      error: "DEV_PROXY_MODULE_FALLBACK",
      message: "Dev server returned HTML for module request /src/main.tsx. Open the server root or fix absolute asset routing.",
    });

    await app.close();
    await new Promise<void>((resolveClose, rejectClose) => upstream.close((error) => error ? rejectClose(error) : resolveClose()));
  });
});
