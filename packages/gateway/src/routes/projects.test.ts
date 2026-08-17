import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { createServer } from "../server.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { ProjectService } from "../services/projects.js";
import { ProjectStateService } from "../services/project-state.js";
import { RepositoryService } from "../services/repositories.js";
import { GitService } from "../services/git.js";
import { UserService } from "../services/users.js";
import { AuditWriter } from "../services/audit.js";
import { signAuthToken } from "../security/http-auth.js";
import { resolveProjectRootPathStatus } from "./projects.js";

const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};

async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

describe("resolveProjectRootPathStatus", () => {
  it("checks a connected Windows node for a moved project folder", async () => {
    const proxyFsOp = vi.fn(async () => false);
    const ws = {
      getFsNodes: () => [{ id: "windows-node", isGateway: false }],
      proxyFsOp,
    } as unknown as Parameters<typeof resolveProjectRootPathStatus>[2];

    await expect(resolveProjectRootPathStatus("E:\\moved-project", "windows-node", ws)).resolves.toBe("missing");
    expect(proxyFsOp).toHaveBeenCalledWith("windows-node", "exists", { path: "E:\\moved-project" });
  });
});

describe("project routes", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
  let userService: UserService;
  const tempRoots: string[] = [];

  function makeGitProjectRoot() {
    const root = mkdtempSync(join(tmpdir(), "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  });

  afterEach(async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("creates project-less sessions and groups explicit project sessions", async () => {
    const user = userService.createUser("project-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const createSessionRes = await app.inject({
      method: "POST",
      url: "/api/sessions",
      headers,
      payload: { name: "Chat one" }
    });
    expect(createSessionRes.statusCode).toBe(201);
    const createdSession = JSON.parse(createSessionRes.body) as { projectId: string | null };
    expect(createdSession.projectId).toBeNull();

    const createProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Jait Repo", rootPath: "/project/Jait" }
    });
    expect(createProjectRes.statusCode).toBe(201);
    const project = JSON.parse(createProjectRes.body) as { id: string; rootPath: string | null; title: string };
    expect(project.rootPath).toBe("/project/Jait");

    const createProjectSessionRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/sessions`,
      headers,
      payload: { name: "Fix tests" }
    });
    expect(createProjectSessionRes.statusCode).toBe(201);

    const listRes = await app.inject({
      method: "GET",
      url: "/api/projects?status=active",
      headers
    });
    expect(listRes.statusCode).toBe(200);
    const body = JSON.parse(listRes.body) as {
      projects: Array<{ id: string; sessions: Array<{ name: string; projectId: string | null }> }>;
    };
    expect(body.projects.length).toBe(1);
    const repoProject = body.projects.find((entry) => entry.id === project.id);
    expect(repoProject?.sessions.map((session) => session.name)).toEqual(["Fix tests"]);
    expect(repoProject?.sessions[0]?.projectId).toBe(project.id);

    const sessionsRes = await app.inject({
      method: "GET",
      url: "/api/sessions?status=active",
      headers
    });
    expect(sessionsRes.statusCode).toBe(200);
    const sessionsBody = JSON.parse(sessionsRes.body) as {
      sessions: Array<{ name: string; projectId: string | null }>;
    };
    expect(sessionsBody.sessions.some((session) => session.name === "Chat one" && session.projectId === null)).toBe(true);
  });

  it("marks project roots that no longer exist", async () => {
    const user = userService.createUser("missing-root-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);
    const existingRoot = mkdtempSync(join(tmpdir(), "jait-existing-project-"));
    tempRoots.push(existingRoot);
    const missingRoot = join(existingRoot, "moved-away");

    await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Still here", rootPath: existingRoot }
    });
    await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Moved", rootPath: missingRoot }
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/api/projects?status=active",
      headers
    });
    expect(listRes.statusCode).toBe(200);
    const projects = (JSON.parse(listRes.body) as {
      projects: Array<{ title: string; rootPathStatus: string }>;
    }).projects;
    expect(projects.find((project) => project.title === "Still here")?.rootPathStatus).toBe("available");
    expect(projects.find((project) => project.title === "Moved")?.rootPathStatus).toBe("missing");
  });

  it("generates an LLM title for a new chat", async () => {
    const user = userService.createUser("title-user", "password123");
    userService.updateSettings(user.id, { apiKeys: { OPENAI_API_KEY: "test-key" } });
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "Diagnose Electron gray screens" } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    try {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/sessions",
        headers,
        payload: {}
      });
      const session = JSON.parse(createRes.body) as { id: string; name: string };
      expect(session.name).toBe("New Chat");

      const titleRes = await app.inject({
        method: "POST",
        url: `/api/sessions/${session.id}/generate-title`,
        headers,
        payload: { prompt: "my windows node shows a gray window randomly" }
      });
      expect(titleRes.statusCode).toBe(200);
      const titleBody = JSON.parse(titleRes.body) as { session: { name: string }; generated: boolean };
      expect(titleBody.generated).toBe(true);
      expect(titleBody.session.name).toBe("Diagnose Electron gray screens");
      expect(fetchSpy).toHaveBeenCalledOnce();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("returns last-active project and supports project-scoped state", async () => {
    const user = userService.createUser("state-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const projectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "My Repo", rootPath: "/project/repo" }
    });
    const project = JSON.parse(projectRes.body) as { id: string };

    const firstSessionRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/sessions`,
      headers,
      payload: { name: "First chat" }
    });
    const firstSession = JSON.parse(firstSessionRes.body) as { id: string };

    await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}/state`,
      headers,
      payload: {
        "project.layout": { tree: false, editor: true },
        "project.tabs": { activeTabId: "file:src/index.ts", tabs: [] }
      }
    });

    const secondSessionRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/sessions`,
      headers,
      payload: { name: "Second chat" }
    });
    expect(secondSessionRes.statusCode).toBe(201);

    const stateRes = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/state?keys=project.layout,project.tabs`,
      headers
    });
    expect(stateRes.statusCode).toBe(200);
    expect(JSON.parse(stateRes.body)).toEqual({
      "project.layout": { tree: false, editor: true },
      "project.tabs": { activeTabId: "file:src/index.ts", tabs: [] }
    });

    const lastActiveRes = await app.inject({
      method: "GET",
      url: "/api/projects/last-active",
      headers
    });
    expect(lastActiveRes.statusCode).toBe(200);
    const lastActive = JSON.parse(lastActiveRes.body) as {
      project: { id: string } | null;
      session: { id: string; projectId: string | null } | null;
    };
    expect(lastActive.project?.id).toBe(project.id);
    expect(lastActive.session?.projectId).toBe(project.id);
    expect(lastActive.session?.id).not.toBe(firstSession.id);
  });

  it("includes each project's persisted editor-mode status in the project list", async () => {
    const user = userService.createUser("editor-status-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const activeProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Editor Active", rootPath: "/project/editor-active" }
    });
    const inactiveProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Editor Inactive", rootPath: "/project/editor-inactive" }
    });
    const activeProject = JSON.parse(activeProjectRes.body) as { id: string };
    const inactiveProject = JSON.parse(inactiveProjectRes.body) as { id: string };

    await app.inject({
      method: "PATCH",
      url: `/api/projects/${activeProject.id}/state`,
      headers,
      payload: {
        "project.ui": {
          panel: { open: true, remotePath: "/project/editor-active" },
          tabs: null,
          layout: null,
          terminal: null,
          preview: null
        }
      }
    });
    await app.inject({
      method: "PATCH",
      url: `/api/projects/${inactiveProject.id}/state`,
      headers,
      payload: {
        "project.ui": {
          panel: { open: false, remotePath: "/project/editor-inactive" },
          tabs: null,
          layout: null,
          terminal: null,
          preview: null
        }
      }
    });

    const listRes = await app.inject({ method: "GET", url: "/api/projects", headers });
    expect(listRes.statusCode).toBe(200);
    const listed = JSON.parse(listRes.body) as {
      projects: Array<{ id: string; editorModeActive?: boolean }>;
    };
    expect(listed.projects.find((project) => project.id === activeProject.id)?.editorModeActive).toBe(true);
    expect(listed.projects.find((project) => project.id === inactiveProject.id)?.editorModeActive).toBe(false);
  });

  it("keeps the explicitly selected project as last-active even after unrelated session activity", async () => {
    const user = userService.createUser("select-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const selectedProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Selected Project", rootPath: "/project/selected" }
    });
    const selectedProject = JSON.parse(selectedProjectRes.body) as { id: string };
    const selectedSessionRes = await app.inject({
      method: "POST",
      url: `/api/projects/${selectedProject.id}/sessions`,
      headers,
      payload: { name: "Selected chat" }
    });
    const selectedSession = JSON.parse(selectedSessionRes.body) as { id: string };

    // User explicitly picks this project/session in the UI.
    const selectRes = await app.inject({
      method: "POST",
      url: "/api/projects/select",
      headers,
      payload: { projectId: selectedProject.id, sessionId: selectedSession.id }
    });
    expect(selectRes.statusCode).toBe(200);

    // Unrelated activity happens afterwards on a different project (e.g. a
    // background automation turn) — this must not steal "last-active".
    const otherProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Other Project", rootPath: "/project/other" }
    });
    const otherProject = JSON.parse(otherProjectRes.body) as { id: string };
    await app.inject({
      method: "POST",
      url: `/api/projects/${otherProject.id}/sessions`,
      headers,
      payload: { name: "Background automation chat" }
    });

    const lastActiveRes = await app.inject({
      method: "GET",
      url: "/api/projects/last-active",
      headers
    });
    expect(lastActiveRes.statusCode).toBe(200);
    const lastActive = JSON.parse(lastActiveRes.body) as {
      project: { id: string } | null;
      session: { id: string } | null;
    };
    expect(lastActive.project?.id).toBe(selectedProject.id);
    expect(lastActive.session?.id).toBe(selectedSession.id);
  });

  it("keeps an explicitly selected project with no session yet as last-active", async () => {
    const user = userService.createUser("select-user-no-session", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const selectedProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Selected Project", rootPath: "/project/selected" }
    });
    const selectedProject = JSON.parse(selectedProjectRes.body) as { id: string };

    // User explicitly picks this project in the UI before it has any
    // sessions, so the client persists sessionId: null (see
    // getLatestProjectSessionId in apps/web/src/lib/project-sessions.ts).
    const selectRes = await app.inject({
      method: "POST",
      url: "/api/projects/select",
      headers,
      payload: { projectId: selectedProject.id, sessionId: null }
    });
    expect(selectRes.statusCode).toBe(200);

    // Unrelated activity happens afterwards on a different project (e.g. a
    // background automation turn) — this must not steal "last-active".
    const otherProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Other Project", rootPath: "/project/other" }
    });
    const otherProject = JSON.parse(otherProjectRes.body) as { id: string };
    await app.inject({
      method: "POST",
      url: `/api/projects/${otherProject.id}/sessions`,
      headers,
      payload: { name: "Background automation chat" }
    });

    const lastActiveRes = await app.inject({
      method: "GET",
      url: "/api/projects/last-active",
      headers
    });
    expect(lastActiveRes.statusCode).toBe(200);
    const lastActive = JSON.parse(lastActiveRes.body) as {
      project: { id: string } | null;
      session: { id: string } | null;
    };
    expect(lastActive.project?.id).toBe(selectedProject.id);
  });

  it("archives a project (and its active sessions) even when it still has sessions", async () => {
    const user = userService.createUser("delete-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const emptyProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Scratch" }
    });
    const emptyProject = JSON.parse(emptyProjectRes.body) as { id: string };

    const deleteEmptyRes = await app.inject({
      method: "DELETE",
      url: `/api/projects/${emptyProject.id}`,
      headers
    });
    expect(deleteEmptyRes.statusCode).toBe(204);

    const seededProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Keep me" }
    });
    const seededProject = JSON.parse(seededProjectRes.body) as { id: string };

    const createSessionRes = await app.inject({
      method: "POST",
      url: `/api/projects/${seededProject.id}/sessions`,
      headers,
      payload: { name: "Existing chat" }
    });
    expect(createSessionRes.statusCode).toBe(201);
    const session = JSON.parse(createSessionRes.body) as { id: string };

    const deleteSeededRes = await app.inject({
      method: "DELETE",
      url: `/api/projects/${seededProject.id}`,
      headers
    });
    expect(deleteSeededRes.statusCode).toBe(204);

    // The project should now be archived (not destroyed) and restorable.
    const archivedRes = await app.inject({
      method: "GET",
      url: "/api/projects/archived",
      headers
    });
    expect(archivedRes.statusCode).toBe(200);
    const archived = JSON.parse(archivedRes.body) as { projects: Array<{ id: string }> };
    expect(archived.projects.map((p) => p.id)).toContain(seededProject.id);

    // Its session should have been archived alongside it.
    const sessionsRes = await app.inject({
      method: "GET",
      url: `/api/projects/${seededProject.id}/sessions?status=archived`,
      headers
    });
    expect(sessionsRes.statusCode).toBe(200);
    const sessions = JSON.parse(sessionsRes.body) as { sessions: Array<{ id: string }> };
    expect(sessions.sessions.map((s) => s.id)).toContain(session.id);
  });

  it("auto-registers git project repositories and exposes manual assignment", async () => {
    const user = userService.createUser("repo-project-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);
    const rootPath = makeGitProjectRoot();

    const createProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Route Repo", rootPath }
    });
    expect(createProjectRes.statusCode).toBe(201);
    const project = JSON.parse(createProjectRes.body) as { id: string; metadata: string | null };
    const metadata = JSON.parse(project.metadata ?? "{}") as { repositoryId?: string };
    expect(metadata.repositoryId).toBeTruthy();

    const reposRes = await app.inject({
      method: "GET",
      url: "/api/repos",
      headers
    });
    expect(reposRes.statusCode).toBe(200);
    const reposBody = JSON.parse(reposRes.body) as { repos: Array<{ id: string; localPath: string }> };
    expect(reposBody.repos).toContainEqual(expect.objectContaining({
      id: metadata.repositoryId,
      localPath: rootPath
    }));

    const assignRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/repository`,
      headers,
      payload: {}
    });
    expect(assignRes.statusCode).toBe(200);
    const assignBody = JSON.parse(assignRes.body) as { skipped: boolean; repo: { id: string } };
    expect(assignBody.skipped).toBe(true);
    expect(assignBody.repo.id).toBe(metadata.repositoryId);
  });

  describe("chat folders", () => {
    async function folderUser(name: string) {
      const user = userService.createUser(name, "password123");
      return authHeaders(user.id, user.username, testConfig.jwtSecret);
    }

    const createFolder = async (headers: Record<string, string>, payload: Record<string, unknown>) => {
      const res = await app.inject({ method: "POST", url: "/api/projects", headers, payload: { ...payload } });
      expect(res.statusCode).toBe(201);
      return JSON.parse(res.body) as { id: string; kind: string; rootPath: string | null; color: string | null; description: string | null };
    };

    it("creates a folder with no root path", async () => {
      const headers = await folderUser("folder-user");
      const folder = await createFolder(headers, { title: "Work", description: "Job stuff", color: "blue" });
      expect(folder.kind).toBe("folder");
      expect(folder.rootPath).toBeNull();
      expect(folder.color).toBe("blue");
      expect(folder.description).toBe("Job stuff");
    });

    it("creates distinct folders instead of collapsing them by root path", async () => {
      const headers = await folderUser("folder-distinct-user");
      const a = await createFolder(headers, { title: "A" });
      const b = await createFolder(headers, { title: "B" });
      expect(a.id).not.toBe(b.id);
    });

    it("refuses to create a second project on a directory that is taken", async () => {
      const headers = await folderUser("folder-conflict-user");
      const first = await createFolder(headers, { title: "Jait", rootPath: "/srv/jait" });

      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers,
        payload: { title: "Jait again", rootPath: "/srv/jait", exclusiveRoot: true },
      });

      // Previously this answered 201 with the *existing* project, so the dialog
      // closed, nothing new appeared, and the click looked like it did nothing.
      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body) as { error: string; details: string };
      expect(body.error).toBe("ROOT_PATH_IN_USE");
      expect(body.details).toContain("Jait");

      const listRes = await app.inject({ method: "GET", url: "/api/projects", headers });
      const list = JSON.parse(listRes.body) as { projects: { id: string }[] };
      expect(list.projects.map((p) => p.id)).toEqual([first.id]);
    });

    it("still adopts an existing project when opening a folder rather than creating one", async () => {
      const headers = await folderUser("folder-adopt-user");
      const first = await createFolder(headers, { title: "Jait", rootPath: "/srv/adopt" });

      // The editor's open-folder flow sends no exclusiveRoot: reusing the
      // project you already have is exactly what it wants.
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers,
        payload: { rootPath: "/srv/adopt" },
      });

      expect(res.statusCode).toBe(201);
      expect((JSON.parse(res.body) as { id: string }).id).toBe(first.id);
    });

    it("refuses to give a folder a directory another project already owns", async () => {
      const headers = await folderUser("folder-patch-conflict-user");
      await createFolder(headers, { title: "Jait", rootPath: "/srv/patch-taken" });
      const folder = await createFolder(headers, { title: "Ideas" });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/projects/${folder.id}`,
        headers,
        payload: { rootPath: "/srv/patch-taken" },
      });

      expect(res.statusCode).toBe(409);
      expect((JSON.parse(res.body) as { error: string }).error).toBe("ROOT_PATH_IN_USE");
      // The folder must be untouched, not half-updated.
      const after = await app.inject({ method: "GET", url: "/api/projects", headers });
      const rows = (JSON.parse(after.body) as { projects: { id: string; rootPath: string | null; kind: string }[] }).projects;
      const unchanged = rows.find((p) => p.id === folder.id);
      expect(unchanged?.rootPath).toBeNull();
      expect(unchanged?.kind).toBe("folder");
    });

    it("lets a project keep its own directory when nothing else changes", async () => {
      const headers = await folderUser("folder-patch-self-user");
      const project = await createFolder(headers, { title: "Jait", rootPath: "/srv/self" });

      // Re-sending the row's own path must not read as a conflict with itself.
      const res = await app.inject({
        method: "PATCH",
        url: `/api/projects/${project.id}`,
        headers,
        payload: { rootPath: "/srv/self", title: "Renamed" },
      });

      expect(res.statusCode).toBe(200);
      expect((JSON.parse(res.body) as { title: string }).title).toBe("Renamed");
    });

    it("moves a project into a folder", async () => {
      const headers = await folderUser("folder-move-user");
      const parent = await createFolder(headers, { title: "Parent" });
      const child = await createFolder(headers, { title: "Child" });

      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${child.id}/move`,
        headers,
        payload: { parentId: parent.id }
      });
      expect(res.statusCode).toBe(200);
      expect((JSON.parse(res.body) as { parentId: string }).parentId).toBe(parent.id);
    });

    it("rejects a cyclic move with 400", async () => {
      const headers = await folderUser("folder-cycle-user");
      const parent = await createFolder(headers, { title: "Parent" });
      const child = await createFolder(headers, { title: "Child" });
      await app.inject({ method: "POST", url: `/api/projects/${child.id}/move`, headers, payload: { parentId: parent.id } });

      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${parent.id}/move`,
        headers,
        payload: { parentId: child.id }
      });
      expect(res.statusCode).toBe(400);
      expect((JSON.parse(res.body) as { error: string }).error).toBe("CYCLE");
    });

    it("rejects creating a folder under an unknown parent", async () => {
      const headers = await folderUser("folder-bad-parent-user");
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers,
        payload: { title: "Orphan", parentId: "does-not-exist" }
      });
      expect(res.statusCode).toBe(400);
      expect((JSON.parse(res.body) as { error: string }).error).toBe("PARENT_NOT_FOUND");
    });

    it("patches instructions, description and colour, and clears them with null", async () => {
      const headers = await folderUser("folder-patch-user");
      const folder = await createFolder(headers, { title: "Ctx" });

      const set = await app.inject({
        method: "PATCH",
        url: `/api/projects/${folder.id}`,
        headers,
        payload: { instructions: "answer in german", description: "d", color: "#00FF00" }
      });
      expect(set.statusCode).toBe(200);
      const afterSet = JSON.parse(set.body) as { instructions: string; description: string; color: string };
      expect(afterSet.instructions).toBe("answer in german");
      expect(afterSet.color).toBe("#00ff00");

      const clear = await app.inject({
        method: "PATCH",
        url: `/api/projects/${folder.id}`,
        headers,
        payload: { instructions: null, color: null }
      });
      const afterClear = JSON.parse(clear.body) as { instructions: string | null; color: string | null; description: string };
      expect(afterClear.instructions).toBeNull();
      expect(afterClear.color).toBeNull();
      // Not included in the patch, so it must survive untouched.
      expect(afterClear.description).toBe("d");
    });

    it("reports subtree size before an archive", async () => {
      const headers = await folderUser("folder-subtree-user");
      const parent = await createFolder(headers, { title: "Parent" });
      const child = await createFolder(headers, { title: "Child" });
      await app.inject({ method: "POST", url: `/api/projects/${child.id}/move`, headers, payload: { parentId: parent.id } });
      await app.inject({ method: "POST", url: `/api/projects/${child.id}/sessions`, headers, payload: { name: "chat" } });

      const res = await app.inject({ method: "GET", url: `/api/projects/${parent.id}/subtree`, headers });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { descendantCount: number; sessionCount: number };
      expect(body.descendantCount).toBe(1);
      expect(body.sessionCount).toBe(1);
    });

    it("does not leak another user's folder as a move target", async () => {
      const mine = await folderUser("folder-owner-a");
      const theirs = await folderUser("folder-owner-b");
      const foreign = await createFolder(theirs, { title: "Theirs" });
      const own = await createFolder(mine, { title: "Mine" });

      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${own.id}/move`,
        headers: mine,
        payload: { parentId: foreign.id }
      });
      expect(res.statusCode).toBe(400);
      expect((JSON.parse(res.body) as { error: string }).error).toBe("PARENT_NOT_FOUND");
    });
  });
});
