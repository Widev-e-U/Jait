import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { createServer } from "../server.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { WorkspaceService } from "../services/workspaces.js";
import { WorkspaceStateService } from "../services/workspace-state.js";
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

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const workspaceService = new WorkspaceService(opened.db);
    const workspaceState = new WorkspaceStateService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      workspaceService,
      workspaceState,
      userService,
      audit,
    });
  });

  afterEach(async () => {
    await app.close();
    sqlite.close();
  });

  it("creates a default workspace when creating a session and groups more sessions under an explicit workspace", async () => {
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
    expect(createdSession.workspaceId).toBeTruthy();

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
    expect(body.workspaces.length).toBe(2);
    const repoWorkspace = body.workspaces.find((entry) => entry.id === workspace.id);
    expect(repoWorkspace?.sessions.map((session) => session.name)).toEqual(["Fix tests"]);
    expect(repoWorkspace?.sessions[0]?.workspaceId).toBe(workspace.id);
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
});
