/**
 * Integration test: POST /api/project/open
 *
 * Verifies that:
 * 1. A filesystem surface is created when opening a project
 * 2. The surface is accessible via GET /api/project/list
 * 3. State is persisted in session_state DB for late-joiners
 * 4. WS clients receive project.open UI command
 * 5. Stopping and replacing surfaces works
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
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";


describe("POST /api/project/open", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let address: string;
  const sessionId = "test-session-" + Date.now();
  let sessionState: SessionStateService;
  let surfaceRegistry: SurfaceRegistry;
  let sessions: SessionService;
  let projects: ProjectService;
  let projectState: ProjectStateService;
  let users: UserService;
  let writableTestRoot: string;
  let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
  let writableTestFile: string;

  beforeAll(async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    users = new UserService(db);
    projects = new ProjectService(db);
    projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    writableTestRoot = await mkdtemp(join(tmpdir(), "jait-project-route-"));
    execFileSync("git", ["init", "--quiet"], { cwd: writableTestRoot });
    await mkdir(join(writableTestRoot, "data"), { recursive: true });

    const ws = new WsControlPlane(config);

    // Persist project state on surface start (same as index.ts)
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

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "project.panel": null });
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

    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    writableTestFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(writableTestFile, "before", "utf-8");
  }, 60_000);

  afterAll(async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  });

  it("should create a filesystem surface and return surfaceId", async () => {
    const res = await fetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId }),
    });

    expect(res.ok).toBe(true);
    const data = (await res.json()) as { surfaceId: string; projectRoot: string };
    expect(data.surfaceId).toMatch(/^filesystem-/);
    expect(data.projectRoot).toBe(writableTestRoot);
  });

  it("should make files browsable via GET /api/project/list", async () => {
    // First open the project
    const openRes = await fetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    // Now list the directory
    const listRes = await fetch(
      `${address}/api/project/list?path=${encodeURIComponent(writableTestRoot)}&surfaceId=${surfaceId}`,
    );

    expect(listRes.ok).toBe(true);
    const listData = (await listRes.json()) as { path: string; entries: unknown[] };
    expect(listData.path).toBe(writableTestRoot);
    expect(Array.isArray(listData.entries)).toBe(true);
    // ~/.jait should have at least the data directory
    expect(listData.entries.length).toBeGreaterThan(0);
  });

  it("should persist project state to session_state DB", async () => {
    const openRes = await fetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Editor mode is opt-in, so the panel state only opens when requested.
      body: JSON.stringify({ path: writableTestRoot, sessionId, openPanel: true }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    // Check DB state
    const state = sessionState.get(sessionId, ["project.panel"]);
    expect(state["project.panel"]).toEqual({
      open: true,
      remotePath: writableTestRoot,
      surfaceId,
      nodeId: "gateway",
    });
  });

  it("should persist unified project UI state for reload restore", async () => {
    const user = users.createUser(`project-state-${Date.now()}`, "password123");
    const project = projects.create({
      userId: user.id,
      title: "jait",
      rootPath: writableTestRoot,
      nodeId: "gateway",
    });
    const session = sessions.create({
      userId: user.id,
      projectId: project.id,
      projectPath: writableTestRoot,
      name: "Current chat",
    });
    projectState.set(project.id, {
      "project.ui": {
        panel: { open: false, remotePath: writableTestRoot, surfaceId: "old-surface", nodeId: "gateway" },
        tabs: { remoteRoot: writableTestRoot, tabs: [], activePath: null, activePreview: null },
        layout: { tree: false, editor: true },
        terminal: { open: true },
        preview: null,
      },
    });

    const openRes = await fetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId: session.id }),
    });
    const { surfaceId, panelOpen } = (await openRes.json()) as { surfaceId: string; panelOpen: boolean };

    expect(panelOpen).toBe(false);
    const state = projectState.get(project.id, ["project.ui"]);
    expect(state["project.ui"]).toEqual({
      panel: { open: false, remotePath: writableTestRoot, surfaceId, nodeId: "gateway" },
      tabs: { remoteRoot: writableTestRoot, tabs: [], activePath: null, activePreview: null },
      layout: { tree: false, editor: true },
      terminal: { open: true },
      preview: null,
    });
  });

  it("should explicitly reopen a project whose editor panel was closed", async () => {
    const user = users.createUser(`project-explicit-open-${Date.now()}`, "password123");
    const project = projects.create({
      userId: user.id,
      title: "jait",
      rootPath: writableTestRoot,
      nodeId: "gateway",
    });
    const session = sessions.create({
      userId: user.id,
      projectId: project.id,
      projectPath: writableTestRoot,
      name: "Current chat",
    });
    projectState.set(project.id, {
      "project.ui": {
        panel: { open: false, remotePath: writableTestRoot, nodeId: "gateway" },
        tabs: null,
        layout: { tree: true, editor: false },
        terminal: null,
        preview: null,
      },
    });

    const openRes = await fetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId: session.id, openPanel: true }),
    });
    const data = (await openRes.json()) as { surfaceId: string; panelOpen: boolean };

    expect(data.panelOpen).toBe(true);
    const state = projectState.get(project.id, ["project.ui"]);
    expect(state["project.ui"]).toMatchObject({
      panel: { open: true, surfaceId: data.surfaceId },
      layout: { tree: true, editor: false },
    });
  });

  it("should reject non-existent paths", async () => {
    const res = await fetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/nonexistent/path/12345", sessionId }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("PATH_NOT_FOUND");
  });

  it("should reject path traversal in POST /api/project/apply-diff", async () => {
    const openRes = await fetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    const applyRes = await fetch(`${address}/api/project/apply-diff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "../outside.txt", content: "blocked", surfaceId }),
    });

    expect(applyRes.status).toBe(400);
    const data = (await applyRes.json()) as { error: string };
    expect(data.error).toBe("VALIDATION_ERROR");
  });

  it("should write files via POST /api/project/write", async () => {
    const openRes = await fetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    const writeRes = await fetch(`${address}/api/project/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestFile, content: "after", surfaceId }),
    });

    expect(writeRes.ok).toBe(true);
    await expect(readFile(writableTestFile, "utf-8")).resolves.toBe("after");
  });

  it("should attach a project when opening a directory from a project-less session", async () => {
    const user = users.createUser(`open-user-${Date.now()}`, "password123");
    const session = sessions.create({ userId: user.id, name: "No project yet" });
    expect(session.projectId).toBeNull();

    const openRes = await fetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId: session.id }),
    });

    expect(openRes.ok).toBe(true);
    const data = (await openRes.json()) as { projectId: string | null; projectRoot: string };
    expect(data.projectId).toBeTruthy();
    expect(data.projectRoot).toBe(writableTestRoot);

    const updatedSession = sessions.getById(session.id, user.id);
    expect(updatedSession?.projectId).toBe(data.projectId);
    expect(updatedSession?.projectPath).toBe(writableTestRoot);
    expect(data.projectId ? projects.getById(data.projectId, user.id)?.rootPath : null).toBe(writableTestRoot);
  });

  it("should return filename and content search results via GET /api/project/search", async () => {
    const searchFile = join(writableTestRoot, "nested", "unique-search-target.ts");
    await writeFile(searchFile, "const UNIQUE_SEARCH_TOKEN = 'project-search-regression';\n", "utf-8");

    const authResponse = await fetch(`${address}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `project-search-${Date.now()}`,
        password: "password123",
      }),
    });
    const { access_token: accessToken, user } = (await authResponse.json()) as {
      access_token: string;
      user: { id: string };
    };
    const searchHeaders = { Authorization: `Bearer ${accessToken}` };
    const searchSession = sessions.create({ userId: user.id, name: "Project search" });

    const openRes = await fetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId: searchSession.id }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    const unauthorizedSearch = await fetch(
      `${address}/api/project/search?query=unique-search-target&mode=files&surfaceId=${encodeURIComponent(surfaceId)}`,
    );
    expect(unauthorizedSearch.status).toBe(401);

    const fileSearchRes = await fetch(
      `${address}/api/project/search?query=${encodeURIComponent("unique-search-target")}&mode=files&surfaceId=${encodeURIComponent(surfaceId)}`,
      { headers: searchHeaders },
    );
    expect(fileSearchRes.ok).toBe(true);
    const fileSearchData = (await fileSearchRes.json()) as { files: { path: string; name: string }[] };
    expect(fileSearchData.files).toContainEqual({
      path: "nested/unique-search-target.ts",
      name: "unique-search-target.ts",
    });

    const contentSearchRes = await fetch(
      `${address}/api/project/search?query=${encodeURIComponent("project-search-regression")}&mode=content&surfaceId=${encodeURIComponent(surfaceId)}`,
      { headers: searchHeaders },
    );
    expect(contentSearchRes.ok).toBe(true);
    const contentSearchData = (await contentSearchRes.json()) as { matches: { file: string; line: number; content: string }[] };
    expect(contentSearchData.matches).toContainEqual({
      file: "nested/unique-search-target.ts",
      line: 1,
      content: "const UNIQUE_SEARCH_TOKEN = 'project-search-regression';",
    });
  });

  it("should reject path traversal in POST /api/project/write", async () => {
    const openRes = await fetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    const writeRes = await fetch(`${address}/api/project/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "../outside.txt", content: "blocked", surfaceId }),
    });

    expect(writeRes.status).toBe(400);
    const data = (await writeRes.json()) as { error: string };
    expect(data.error).toBe("VALIDATION_ERROR");
  });

  it("should replace existing filesystem surface for the session", async () => {
    // Open first project
    const res1 = await fetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId }),
    });
    const { surfaceId: first } = (await res1.json()) as { surfaceId: string };

    // Open a different project (same session)
    const secondProjectRoot = join(writableTestRoot, "second-project");
    await mkdir(secondProjectRoot, { recursive: true });
    const res2 = await fetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: secondProjectRoot, sessionId }),
    });
    const { surfaceId: second } = (await res2.json()) as { surfaceId: string };

    // First surface should be gone
    expect(surfaceRegistry.getSurface(first)).toBeUndefined();
    // Second should be running
    const s = surfaceRegistry.getSurface(second);
    expect(s).toBeDefined();
    expect(s?.state).toBe("running");
  });

  it("should preserve project state during shutdown for restart restore", async () => {
    const openRes = await fetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId, openPanel: true }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    await surfaceRegistry.stopAll("shutdown");

    const state = sessionState.get(sessionId, ["project.panel"]);
    expect(state["project.panel"]).toEqual({
      open: true,
      remotePath: writableTestRoot,
      surfaceId,
      nodeId: "gateway",
    });
  });

  it("should update the session projectPath without rewriting the project rootPath", async () => {
    const user = users.createUser(`project-open-${Date.now()}`, "password123");
    const project = projects.create({
      userId: user.id,
      title: "jait",
      rootPath: "/home/alice/jait",
      nodeId: "gateway",
    });
    const session = sessions.create({
      userId: user.id,
      projectId: project.id,
      projectPath: "/home/alice/jait",
      name: "Current chat",
    });

    const res = await fetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId: session.id }),
    });

    expect(res.ok).toBe(true);

    const updatedSession = sessions.getById(session.id, user.id);
    expect(updatedSession?.projectPath).toBe(writableTestRoot);

    const updatedProject = projects.getById(project.id, user.id);
    expect(updatedProject?.rootPath).toBe("/home/alice/jait");
  });

  it("should read from the surface that allows the path when the requested surface is stale", async () => {
    const firstRoot = await mkdtemp(join(tmpdir(), "jait-project-first-"));
    const secondRoot = await mkdtemp(join(tmpdir(), "jait-project-second-"));
    const secondFile = join(secondRoot, "AGENTS.md");
    await writeFile(secondFile, "project instructions", "utf-8");

    try {
      const firstOpen = await fetch(`${address}/api/project/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: firstRoot, sessionId: `first-${Date.now()}` }),
      });
      const { surfaceId: staleSurfaceId } = (await firstOpen.json()) as { surfaceId: string };

      await fetch(`${address}/api/project/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: secondRoot, sessionId: `second-${Date.now()}` }),
      });

      const readRes = await fetch(
        `${address}/api/project/read?path=${encodeURIComponent(secondFile)}&surfaceId=${encodeURIComponent(staleSurfaceId)}`,
      );

      expect(readRes.ok).toBe(true);
      const data = (await readRes.json()) as { content: string };
      expect(data.content).toBe("project instructions");
    } finally {
      await rm(firstRoot, { recursive: true, force: true });
      await rm(secondRoot, { recursive: true, force: true });
    }
  });
});
