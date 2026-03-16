/**
 * Integration test: POST /api/workspace/open
 *
 * Verifies that:
 * 1. A filesystem surface is created when opening a workspace
 * 2. The surface is accessible via GET /api/workspace/list
 * 3. State is persisted in session_state DB for late-joiners
 * 4. WS clients receive workspace.open UI command
 * 5. Stopping and replacing surfaces works
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { loadConfig } from "../config.js";
import { createServer } from "../server.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { SessionStateService } from "../services/session-state.js";
import { SurfaceRegistry, FileSystemSurfaceFactory } from "../surfaces/index.js";
import { WsControlPlane } from "../ws.js";
import { UserService } from "../services/users.js";
import { homedir } from "node:os";
import { join } from "node:path";

// Use a known directory that exists on the system
const TEST_DIR = join(homedir(), ".jait");

describe("POST /api/workspace/open", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let address: string;
  const sessionId = "test-session-" + Date.now();
  let sessionState: SessionStateService;
  let surfaceRegistry: SurfaceRegistry;

  beforeAll(async () => {
    const config = loadConfig();
    const { db, sqlite } = await openDatabase();
    migrateDatabase(sqlite);

    const sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    const users = new UserService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const ws = new WsControlPlane(config);

    // Persist workspace state on surface start (same as index.ts)
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const workspaceRoot = (snap.metadata as Record<string, unknown>)?.workspaceRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "workspace.panel": { open: true, remotePath: workspaceRoot, surfaceId: id } });
        }
      }
    };

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "workspace.panel": null });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      surfaceRegistry,
      sessionState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;
  });

  afterAll(async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
  });

  it("should create a filesystem surface and return surfaceId", async () => {
    const res = await fetch(`${address}/api/workspace/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: TEST_DIR, sessionId }),
    });

    expect(res.ok).toBe(true);
    const data = (await res.json()) as { surfaceId: string; workspaceRoot: string };
    expect(data.surfaceId).toMatch(/^filesystem-/);
    expect(data.workspaceRoot).toBe(TEST_DIR);
  });

  it("should make files browsable via GET /api/workspace/list", async () => {
    // First open the workspace
    const openRes = await fetch(`${address}/api/workspace/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: TEST_DIR, sessionId }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    // Now list the directory
    const listRes = await fetch(
      `${address}/api/workspace/list?path=${encodeURIComponent(TEST_DIR)}&surfaceId=${surfaceId}`,
    );

    expect(listRes.ok).toBe(true);
    const listData = (await listRes.json()) as { path: string; entries: unknown[] };
    expect(listData.path).toBe(TEST_DIR);
    expect(Array.isArray(listData.entries)).toBe(true);
    // ~/.jait should have at least the data directory
    expect(listData.entries.length).toBeGreaterThan(0);
  });

  it("should persist workspace state to session_state DB", async () => {
    const openRes = await fetch(`${address}/api/workspace/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: TEST_DIR, sessionId }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    // Check DB state
    const state = sessionState.get(sessionId, ["workspace.panel"]);
    expect(state["workspace.panel"]).toEqual({
      open: true,
      remotePath: TEST_DIR,
      surfaceId,
      nodeId: 'gateway',
    });
  });

  it("should reject non-existent paths", async () => {
    const res = await fetch(`${address}/api/workspace/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/nonexistent/path/12345", sessionId }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("PATH_NOT_FOUND");
  });

  it("should reject path traversal in POST /api/workspace/apply-diff", async () => {
    const openRes = await fetch(`${address}/api/workspace/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: TEST_DIR, sessionId }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    const applyRes = await fetch(`${address}/api/workspace/apply-diff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "../outside.txt", content: "blocked", surfaceId }),
    });

    expect(applyRes.status).toBe(400);
    const data = (await applyRes.json()) as { error: string };
    expect(data.error).toBe("VALIDATION_ERROR");
  });

  it("should replace existing filesystem surface for the session", async () => {
    // Open first workspace
    const res1 = await fetch(`${address}/api/workspace/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: TEST_DIR, sessionId }),
    });
    const { surfaceId: first } = (await res1.json()) as { surfaceId: string };

    // Open a different workspace (same session)
    const res2 = await fetch(`${address}/api/workspace/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: homedir(), sessionId }),
    });
    const { surfaceId: second } = (await res2.json()) as { surfaceId: string };

    // First surface should be gone
    expect(surfaceRegistry.getSurface(first)).toBeUndefined();
    // Second should be running
    const s = surfaceRegistry.getSurface(second);
    expect(s).toBeDefined();
    expect(s?.state).toBe("running");
  });

  it("should preserve workspace state during shutdown for restart restore", async () => {
    const openRes = await fetch(`${address}/api/workspace/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: TEST_DIR, sessionId }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    await surfaceRegistry.stopAll("shutdown");

    const state = sessionState.get(sessionId, ["workspace.panel"]);
    expect(state["workspace.panel"]).toEqual({
      open: true,
      remotePath: TEST_DIR,
      surfaceId,
      nodeId: "gateway",
    });
  });
});
