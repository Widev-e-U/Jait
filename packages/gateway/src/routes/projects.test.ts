import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
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

const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};

async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

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
      audit,
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
      payload: { name: "Chat one" },
    });
    expect(createSessionRes.statusCode).toBe(201);
    const createdSession = JSON.parse(createSessionRes.body) as { projectId: string | null };
    expect(createdSession.projectId).toBeNull();

    const createProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Jait Repo", rootPath: "/project/Jait" },
    });
    expect(createProjectRes.statusCode).toBe(201);
    const project = JSON.parse(createProjectRes.body) as { id: string; rootPath: string | null; title: string };
    expect(project.rootPath).toBe("/project/Jait");

    const createProjectSessionRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/sessions`,
      headers,
      payload: { name: "Fix tests" },
    });
    expect(createProjectSessionRes.statusCode).toBe(201);

    const listRes = await app.inject({
      method: "GET",
      url: "/api/projects?status=active",
      headers,
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
      headers,
    });
    expect(sessionsRes.statusCode).toBe(200);
    const sessionsBody = JSON.parse(sessionsRes.body) as {
      sessions: Array<{ name: string; projectId: string | null }>;
    };
    expect(sessionsBody.sessions.some((session) => session.name === "Chat one" && session.projectId === null)).toBe(true);
  });

  it("returns last-active project and supports project-scoped state", async () => {
    const user = userService.createUser("state-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const projectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "My Repo", rootPath: "/project/repo" },
    });
    const project = JSON.parse(projectRes.body) as { id: string };

    const firstSessionRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/sessions`,
      headers,
      payload: { name: "First chat" },
    });
    const firstSession = JSON.parse(firstSessionRes.body) as { id: string };

    await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}/state`,
      headers,
      payload: {
        "project.layout": { tree: false, editor: true },
        "project.tabs": { activeTabId: "file:src/index.ts", tabs: [] },
      },
    });

    const secondSessionRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/sessions`,
      headers,
      payload: { name: "Second chat" },
    });
    expect(secondSessionRes.statusCode).toBe(201);

    const stateRes = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/state?keys=project.layout,project.tabs`,
      headers,
    });
    expect(stateRes.statusCode).toBe(200);
    expect(JSON.parse(stateRes.body)).toEqual({
      "project.layout": { tree: false, editor: true },
      "project.tabs": { activeTabId: "file:src/index.ts", tabs: [] },
    });

    const lastActiveRes = await app.inject({
      method: "GET",
      url: "/api/projects/last-active",
      headers,
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

  it("archives a project (and its active sessions) even when it still has sessions", async () => {
    const user = userService.createUser("delete-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const emptyProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Scratch" },
    });
    const emptyProject = JSON.parse(emptyProjectRes.body) as { id: string };

    const deleteEmptyRes = await app.inject({
      method: "DELETE",
      url: `/api/projects/${emptyProject.id}`,
      headers,
    });
    expect(deleteEmptyRes.statusCode).toBe(204);

    const seededProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Keep me" },
    });
    const seededProject = JSON.parse(seededProjectRes.body) as { id: string };

    const createSessionRes = await app.inject({
      method: "POST",
      url: `/api/projects/${seededProject.id}/sessions`,
      headers,
      payload: { name: "Existing chat" },
    });
    expect(createSessionRes.statusCode).toBe(201);
    const session = JSON.parse(createSessionRes.body) as { id: string };

    const deleteSeededRes = await app.inject({
      method: "DELETE",
      url: `/api/projects/${seededProject.id}`,
      headers,
    });
    expect(deleteSeededRes.statusCode).toBe(204);

    // The project should now be archived (not destroyed) and restorable.
    const archivedRes = await app.inject({
      method: "GET",
      url: "/api/projects/archived",
      headers,
    });
    expect(archivedRes.statusCode).toBe(200);
    const archived = JSON.parse(archivedRes.body) as { projects: Array<{ id: string }> };
    expect(archived.projects.map((p) => p.id)).toContain(seededProject.id);

    // Its session should have been archived alongside it.
    const sessionsRes = await app.inject({
      method: "GET",
      url: `/api/projects/${seededProject.id}/sessions?status=archived`,
      headers,
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
      payload: { title: "Route Repo", rootPath },
    });
    expect(createProjectRes.statusCode).toBe(201);
    const project = JSON.parse(createProjectRes.body) as { id: string; metadata: string | null };
    const metadata = JSON.parse(project.metadata ?? "{}") as { repositoryId?: string };
    expect(metadata.repositoryId).toBeTruthy();

    const reposRes = await app.inject({
      method: "GET",
      url: "/api/repos",
      headers,
    });
    expect(reposRes.statusCode).toBe(200);
    const reposBody = JSON.parse(reposRes.body) as { repos: Array<{ id: string; localPath: string }> };
    expect(reposBody.repos).toContainEqual(expect.objectContaining({
      id: metadata.repositoryId,
      localPath: rootPath,
    }));

    const assignRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/repository`,
      headers,
      payload: {},
    });
    expect(assignRes.statusCode).toBe(200);
    const assignBody = JSON.parse(assignRes.body) as { skipped: boolean; repo: { id: string } };
    expect(assignBody.skipped).toBe(true);
    expect(assignBody.repo.id).toBe(metadata.repositoryId);
  });
});
