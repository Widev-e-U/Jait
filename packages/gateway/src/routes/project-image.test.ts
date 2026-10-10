import { signAuthToken } from "../security/http-auth.js";
/** Project image reads preserve binary bytes, enforce size limits and project ownership. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { loadConfig } from "../config.js";
import { createServer } from "../server.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { SessionStateService } from "../services/session-state.js";
import { ProjectService } from "../services/projects.js";
import { ProjectStateService } from "../services/project-state.js";
import { SurfaceRegistry, FileSystemSurfaceFactory } from "../surfaces/index.js";
import { WsControlPlane } from "../ws.js";
import { UserService } from "../services/users.js";
import { join } from "node:path";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

describe("project image previews", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let address: string;
  let authToken: string;
  let ownerId: string;
  let foreignToken: string;
  const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", "Bearer " + authToken);
    return fetch(input, { ...init, headers });
  };
  let sessionId = "reveal-session-" + Date.now();
  let surfaceRegistry: SurfaceRegistry;
  let writableTestRoot: string;
  let nestedFile: string;
  let surfaceId: string;
  let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];

  beforeAll(async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const sessions = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const users = new UserService(db);
    const owner = users.createUser("reveal-owner", "password123");
    ownerId = owner.id;
    const foreign = users.createUser("image-foreign", "password123");
    foreignToken = await signAuthToken(foreign, config.jwtSecret);
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    const projects = new ProjectService(db);
    const projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const ws = new WsControlPlane(config);

    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "project.panel": { open: true, remotePath: projectRoot, surfaceId: id } });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      projectService: projects,
      surfaceRegistry,
      sessionState,
      projectState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;

    writableTestRoot = await mkdtemp(join(tmpdir(), "jait-reveal-route-"));
    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    nestedFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(nestedFile, "before", "utf-8");
    const response = await authedFetch(`${address}/api/project/open`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId }),
    });
    surfaceId = (await response.json() as { surfaceId: string }).surfaceId;
  }, 60_000);

  afterAll(async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  });

  it("returns exact binary data as an image data URL", async () => {
    const file = join(writableTestRoot, "image.png");
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00]);
    await writeFile(file, bytes);
    const response = await authedFetch(`${address}/api/project/read?format=image&surfaceId=${surfaceId}&path=${encodeURIComponent(file)}`);
    expect(response.status).toBe(200);
    expect((await response.json() as {content:string}).content).toBe("data:image/png;base64," + bytes.toString("base64"));
  });

  it("rejects unsupported files and paths outside the project", async () => {
    const unsupported = await authedFetch(`${address}/api/project/read?format=image&surfaceId=${surfaceId}&path=${encodeURIComponent(nestedFile)}`);
    expect(unsupported.status).toBe(400);
    const outside = await authedFetch(`${address}/api/project/read?format=image&surfaceId=${surfaceId}&path=${encodeURIComponent(join(writableTestRoot, "../outside.png"))}`);
    expect(outside.status).toBe(400);
  });

  it("rejects oversized images before reading binary content", async () => {
    const file = join(writableTestRoot, "large.png");
    await writeFile(file, Buffer.alloc(20 * 1024 * 1024 + 1));
    const response = await authedFetch(`${address}/api/project/read?format=image&surfaceId=${surfaceId}&path=${encodeURIComponent(file)}`);
    expect(response.status).toBe(413);
  });

  it("rejects another user's project surface", async () => {
    const response = await fetch(`${address}/api/project/read?format=image&surfaceId=${surfaceId}&path=${encodeURIComponent(nestedFile)}`, {
      headers: { Authorization: "Bearer " + foreignToken },
    });
    expect(response.status).toBe(404);
  });

  it("requires authentication", async () => {
    const response = await fetch(`${address}/api/project/read?format=image&surfaceId=${surfaceId}&path=${encodeURIComponent(nestedFile)}`);
    expect(response.status).toBe(401);
  });
});
