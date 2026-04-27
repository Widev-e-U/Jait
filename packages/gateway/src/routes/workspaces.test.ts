import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { createServer } from "../server.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { WorkspaceService } from "../services/workspaces.js";
import { WorkspaceStateService } from "../services/workspace-state.js";
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

describe("workspace routes", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
  let userService: UserService;
  const tempRoots: string[] = [];

  function makeGitWorkspaceRoot() {
    const root = mkdtempSync(join(tmpdir(), "jait-workspace-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const workspaceService = new WorkspaceService(opened.db);
    const workspaceState = new WorkspaceStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      workspaceService,
      workspaceState,
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

  it("creates workspace-less sessions and groups explicit workspace sessions", async () => {
    const user = userService.createUser("workspace-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const createSessionRes = await app.inject({
      method: "POST",
      url: "/api/sessions",
      headers,
      payload: { name: "Chat one" },
    });
    expect(createSessionRes.statusCode).toBe(201);
    const createdSession = JSON.parse(createSessionRes.body) as { workspaceId: string | null };
    expect(createdSession.workspaceId).toBeNull();

    const createWorkspaceRes = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers,
      payload: { title: "Jait Repo", rootPath: "/workspace/Jait" },
    });
    expect(createWorkspaceRes.statusCode).toBe(201);
    const workspace = JSON.parse(createWorkspaceRes.body) as { id: string; rootPath: string | null; title: string };
    expect(workspace.rootPath).toBe("/workspace/Jait");

    const createWorkspaceSessionRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspace.id}/sessions`,
      headers,
      payload: { name: "Fix tests" },
    });
    expect(createWorkspaceSessionRes.statusCode).toBe(201);

    const listRes = await app.inject({
      method: "GET",
      url: "/api/workspaces?status=active",
      headers,
    });
    expect(listRes.statusCode).toBe(200);
    const body = JSON.parse(listRes.body) as {
      workspaces: Array<{ id: string; sessions: Array<{ name: string; workspaceId: string | null }> }>;
    };
    expect(body.workspaces.length).toBe(1);
    const repoWorkspace = body.workspaces.find((entry) => entry.id === workspace.id);
    expect(repoWorkspace?.sessions.map((session) => session.name)).toEqual(["Fix tests"]);
    expect(repoWorkspace?.sessions[0]?.workspaceId).toBe(workspace.id);

    const sessionsRes = await app.inject({
      method: "GET",
      url: "/api/sessions?status=active",
      headers,
    });
    expect(sessionsRes.statusCode).toBe(200);
    const sessionsBody = JSON.parse(sessionsRes.body) as {
      sessions: Array<{ name: string; workspaceId: string | null }>;
    };
    expect(sessionsBody.sessions.some((session) => session.name === "Chat one" && session.workspaceId === null)).toBe(true);
  });

  it("returns last-active workspace and supports workspace-scoped state", async () => {
    const user = userService.createUser("state-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const workspaceRes = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers,
      payload: { title: "My Repo", rootPath: "/workspace/repo" },
    });
    const workspace = JSON.parse(workspaceRes.body) as { id: string };

    const firstSessionRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspace.id}/sessions`,
      headers,
      payload: { name: "First chat" },
    });
    const firstSession = JSON.parse(firstSessionRes.body) as { id: string };

    await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspace.id}/state`,
      headers,
      payload: {
        "workspace.layout": { tree: false, editor: true },
        "workspace.tabs": { activeTabId: "file:src/index.ts", tabs: [] },
      },
    });

    const secondSessionRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspace.id}/sessions`,
      headers,
      payload: { name: "Second chat" },
    });
    expect(secondSessionRes.statusCode).toBe(201);

    const stateRes = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspace.id}/state?keys=workspace.layout,workspace.tabs`,
      headers,
    });
    expect(stateRes.statusCode).toBe(200);
    expect(JSON.parse(stateRes.body)).toEqual({
      "workspace.layout": { tree: false, editor: true },
      "workspace.tabs": { activeTabId: "file:src/index.ts", tabs: [] },
    });

    const lastActiveRes = await app.inject({
      method: "GET",
      url: "/api/workspaces/last-active",
      headers,
    });
    expect(lastActiveRes.statusCode).toBe(200);
    const lastActive = JSON.parse(lastActiveRes.body) as {
      workspace: { id: string } | null;
      session: { id: string; workspaceId: string | null } | null;
    };
    expect(lastActive.workspace?.id).toBe(workspace.id);
    expect(lastActive.session?.workspaceId).toBe(workspace.id);
    expect(lastActive.session?.id).not.toBe(firstSession.id);
  });

  it("deletes an empty workspace and rejects deleting one that still has sessions", async () => {
    const user = userService.createUser("delete-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const emptyWorkspaceRes = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers,
      payload: { title: "Scratch" },
    });
    const emptyWorkspace = JSON.parse(emptyWorkspaceRes.body) as { id: string };

    const deleteEmptyRes = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${emptyWorkspace.id}`,
      headers,
    });
    expect(deleteEmptyRes.statusCode).toBe(204);

    const seededWorkspaceRes = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers,
      payload: { title: "Keep me" },
    });
    const seededWorkspace = JSON.parse(seededWorkspaceRes.body) as { id: string };

    const createSessionRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${seededWorkspace.id}/sessions`,
      headers,
      payload: { name: "Existing chat" },
    });
    expect(createSessionRes.statusCode).toBe(201);

    const deleteSeededRes = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${seededWorkspace.id}`,
      headers,
    });
    expect(deleteSeededRes.statusCode).toBe(409);
  });

  it("auto-registers git workspace repositories and exposes manual assignment", async () => {
    const user = userService.createUser("repo-workspace-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);
    const rootPath = makeGitWorkspaceRoot();

    const createWorkspaceRes = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers,
      payload: { title: "Route Repo", rootPath },
    });
    expect(createWorkspaceRes.statusCode).toBe(201);
    const workspace = JSON.parse(createWorkspaceRes.body) as { id: string; metadata: string | null };
    const metadata = JSON.parse(workspace.metadata ?? "{}") as { repositoryId?: string };
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
      url: `/api/workspaces/${workspace.id}/repository`,
      headers,
      payload: {},
    });
    expect(assignRes.statusCode).toBe(200);
    const assignBody = JSON.parse(assignRes.body) as { skipped: boolean; repo: { id: string } };
    expect(assignBody.skipped).toBe(true);
    expect(assignBody.repo.id).toBe(metadata.repositoryId);
  });
});
