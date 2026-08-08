import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { ProviderRegistry } from "../providers/registry.js";
import { signAuthToken } from "../security/http-auth.js";
import { AuditWriter } from "../services/audit.js";
import { ProjectService } from "../services/projects.js";
import { SessionStateService } from "../services/session-state.js";
import { SessionService } from "../services/sessions.js";
import { UserService } from "../services/users.js";
import { createServer } from "../server.js";

describe("moving a chat to a project without its provider", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
  let sessionState: SessionStateService;
  let sessions: SessionService;
  let projects: ProjectService;
  let users: UserService;
  const config = {
    ...loadConfig(),
    jwtSecret: "session-move-provider-fallback-secret",
    logLevel: "silent",
    nodeEnv: "test",
  };

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    sessionState = new SessionStateService(opened.db);
    sessions = new SessionService(opened.db);
    projects = new ProjectService(opened.db);
    users = new UserService(opened.db);
    app = await createServer(config, {
      db: opened.db,
      sqlite,
      sessionService: sessions,
      sessionState,
      projectService: projects,
      userService: users,
      providerRegistry: new ProviderRegistry(),
      audit: new AuditWriter(opened.db),
    });
  });

  afterEach(async () => {
    await app.close();
    sqlite.close();
  });

  it("falls back to Jait and its saved model while preserving other provider models", async () => {
    const user = users.createUser("move-provider-user", "password123");
    users.updateSettings(user.id, { selectedModel: "gpt-5.4" });
    const project = projects.create({
      userId: user.id,
      title: "Gateway project",
      rootPath: "/repo/gateway-project",
      nodeId: "gateway",
    });
    const session = sessions.create({
      userId: user.id,
      name: "Claude chat",
      metadata: {
        chat: {
          provider: "claude-code",
          model: "claude-opus-4-1",
        },
      },
    });
    sessionState.set(session.id, {
      "chat.provider": "claude-code",
      "chat.cliModels": {
        "claude-code": "claude-opus-4-1",
      },
    });
    const token = await signAuthToken(
      { id: user.id, username: user.username },
      config.jwtSecret,
    );

    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/move`,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      payload: { projectId: project.id },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      session: { metadata: string | null; projectId: string | null };
    };
    expect(body.session.projectId).toBe(project.id);
    expect(JSON.parse(body.session.metadata ?? "{}")).toMatchObject({
      chat: {
        provider: "jait",
        model: "gpt-5.4",
      },
    });
    expect(sessionState.get(session.id, ["chat.provider", "chat.cliModels"])).toEqual({
      "chat.provider": "jait",
      "chat.cliModels": {
        "claude-code": "claude-opus-4-1",
        jait: "gpt-5.4",
      },
    });
  });
});
