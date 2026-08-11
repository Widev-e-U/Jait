/**
 * Integration test: POST /api/project/reveal
 *
 * Verifies that:
 * 1. The reveal endpoint requires a path
 * 2. It returns 404 when no filesystem surface is running
 * 3. It returns { ok: true } for a local (gateway) surface revealing a real file
 *    (without actually spawning a GUI file manager in CI — the exec is best-effort
 *    and any failure is surfaced as a 500, so we assert the happy path on a path
 *    that exists; on headless CI xdg-open/open/explorer may be missing, in which
 *    case we only assert that the surface lookup worked by accepting ok or the
 *    documented REVEAL_FAILED error).
 */
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

describe("POST /api/project/reveal", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let address: string;
  const sessionId = "reveal-session-" + Date.now();
  let surfaceRegistry: SurfaceRegistry;
  let writableTestRoot: string;
  let nestedFile: string;
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
  }, 60_000);

  afterAll(async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  });

  it("rejects a request without a path", async () => {
    const res = await fetch(`${address}/api/project/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surfaceId: "none" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when no filesystem surface is running", async () => {
    const res = await fetch(`${address}/api/project/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/tmp", surfaceId: "no-such-surface" }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("NO_PROJECT");
  });

  it("reveals a file inside an open local project surface", async () => {
    const openRes = await fetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    const res = await fetch(`${address}/api/project/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: nestedFile, surfaceId }),
    });

    // On headless CI the platform "open" command may be missing, in which case
    // the route returns 500 REVEAL_FAILED. Either outcome proves the surface
    // was found and the reveal was attempted for the right path.
    if (res.ok) {
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);
    } else {
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("REVEAL_FAILED");
    }
  });

  it("accepts a project-relative path and resolves it against the project root", async () => {
    const openRes = await fetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId: `rel-${sessionId}` }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    // Pass a relative path (no leading project root) — the route should still
    // resolve it under the project root and attempt the reveal.
    const res = await fetch(`${address}/api/project/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "nested/editable.txt", surfaceId }),
    });

    expect([200, 500]).toContain(res.status);
    if (res.ok) {
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);
    } else {
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("REVEAL_FAILED");
    }
  });
});