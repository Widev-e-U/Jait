import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { signAuthToken } from "../security/http-auth.js";
import { SessionStateService } from "../services/session-state.js";
import { SessionService } from "../services/sessions.js";
import { UserService } from "../services/users.js";
import { createTodoTool } from "../tools/core/todo.js";
import { ToolRegistry } from "../tools/registry.js";
import {
  handleMcpRequest,
  listToolsForMcp,
  registerMcpRoutes,
  resolveMcpBaseUrl,
} from "./mcp-server.js";

let appsToClose: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
});

describe("mcp-server", () => {
  it("exposes only non-core builtin tools and allowlisted core tools over MCP", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "read",
      description: "Core read tool",
      tier: "core",
      category: "filesystem",
      source: "builtin",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });
    registry.register({
      name: "jait.todos",
      description: "Manage global Jait todo items",
      tier: "core",
      category: "gateway",
      source: "builtin",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "add", "update", "remove"] },
          todoId: { type: "string" },
        },
        required: ["action"],
      },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });
    registry.register({
      name: "cron.add",
      description: "Create a cron job",
      tier: "standard",
      category: "scheduler",
      source: "builtin",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });
    registry.register({
      name: "mcp.github.create_issue",
      description: "External MCP tool",
      tier: "external",
      category: "external",
      source: "mcp",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });

    expect(listToolsForMcp(registry).map((tool) => tool.name)).toEqual(["jait.todos", "cron.add"]);

    const response = await handleMcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }, registry);

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: [
          {
            name: "jait.todos",
            description: "Manage global Jait todo items",
            inputSchema: {
              type: "object",
              properties: {
                action: { type: "string", enum: ["list", "add", "update", "remove"] },
                todoId: { type: "string" },
              },
              required: ["action"],
            },
          },
          {
            name: "cron.add",
            description: "Create a cron job",
            inputSchema: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
              required: ["name"],
            },
          },
        ],
      },
    });
  });

  it("builds the MCP callback base URL from forwarded headers", () => {
    expect(resolveMcpBaseUrl({
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "gateway.example.com",
        host: "ignored.local:3000",
      },
      protocol: "http",
      hostname: "ignored.local",
    }, { host: "0.0.0.0", port: 3000 })).toBe("https://gateway.example.com");
  });

  it("falls back to the incoming host header before config defaults", () => {
    expect(resolveMcpBaseUrl({
      headers: {
        host: "127.0.0.1:4111",
      },
      protocol: "http",
      hostname: "127.0.0.1",
    }, { host: "0.0.0.0", port: 3000 })).toBe("http://127.0.0.1:4111");
  });

  it("serves initialize over streamable HTTP MCP", async () => {
    const registry = new ToolRegistry();
    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: {
        host: "127.0.0.1",
        port: 3000,
      } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        "mcp-protocol-version": "2025-03-26",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["mcp-protocol-version"]).toBe("2025-03-26");
    expect(response.json()).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: "jait-gateway",
          version: "1.0.0",
        },
      },
    });
  });

  it("serves streamable HTTP initialize on legacy /mcp/sse POST configs", async () => {
    const registry = new ToolRegistry();
    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: {
        host: "127.0.0.1",
        port: 3000,
      } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp/sse",
      headers: {
        "content-type": "application/json",
        "mcp-protocol-version": "2025-03-26",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        serverInfo: {
          name: "jait-gateway",
        },
      },
    });
  });

  it("accepts initialized notifications over streamable HTTP MCP", async () => {
    const registry = new ToolRegistry();
    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: {
        host: "127.0.0.1",
        port: 3000,
      } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
      },
      payload: {
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.body).toBe("");
  });

  it("passes session, project, and provider overrides into MCP tool context", async () => {
    const registry = new ToolRegistry();
    let capturedContext: {
      sessionId: string;
      projectRoot: string;
      userId?: string;
      providerId?: string;
      model?: string;
      runtimeMode?: string;
    } | null = null;

    registry.register({
      name: "surfaces.list",
      description: "List surfaces",
      tier: "standard",
      category: "surfaces",
      source: "builtin",
      parameters: { type: "object", properties: {} },
      async execute(_input, context) {
        capturedContext = {
          sessionId: context.sessionId,
          projectRoot: context.projectRoot,
          userId: context.userId,
          providerId: context.providerId,
          model: context.model,
          runtimeMode: context.runtimeMode,
        };
        return { ok: true, message: "ok" };
      },
    });

    const response = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "surfaces.list",
          arguments: {},
        },
      },
      registry,
      "2025-03-26",
      {
        sessionId: "web-session-123",
        projectRoot: "/tmp/project",
        providerId: "codex",
        model: "gpt-5-codex",
        runtimeMode: "supervised",
      },
    );

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [{ type: "text", text: "ok" }],
        isError: false,
      },
    });
    expect(capturedContext).toEqual({
      sessionId: "web-session-123",
      projectRoot: "/tmp/project",
      userId: undefined,
      providerId: "codex",
      model: "gpt-5-codex",
      runtimeMode: "supervised",
    });
  });

  it("rejects tool calls when no session can be resolved", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "surfaces.list",
      description: "List surfaces",
      tier: "standard",
      category: "surfaces",
      source: "builtin",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });

    const response = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "surfaces.list",
          arguments: {},
        },
      },
      registry,
      "2025-03-26",
      {},
    );

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [{
          type: "text",
          text: "Tool execution requires a sessionId. Authenticate with an active session or provide x-jait-session-id.",
        }],
        isError: true,
      },
    });
  });

  it("uses the authenticated user's last active session for MCP tool calls", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const sessionService = new SessionService(db);
    const registry = new ToolRegistry();
    const userId = "user-123";
    const session = sessionService.create({
      userId,
      name: "Active Session",
      projectPath: "/tmp/current-project",
    });
    const token = await signAuthToken({ id: userId, username: "jakob" }, "test-secret");
    let capturedContext: { sessionId: string; projectRoot: string; userId?: string } | null = null;

    registry.register({
      name: "surfaces.start",
      description: "Start a surface",
      tier: "standard",
      category: "surfaces",
      source: "builtin",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string" },
        },
        required: ["type"],
      },
      async execute(_input, context) {
        capturedContext = {
          sessionId: context.sessionId,
          projectRoot: context.projectRoot,
          userId: context.userId,
        };
        return { ok: true, message: "ok" };
      },
    });

    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      sessionService,
      config: {
        host: "127.0.0.1",
        port: 3000,
        jwtSecret: "test-secret",
      } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "surfaces.start",
          arguments: { type: "filesystem" },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedContext).toEqual({
      sessionId: session.id,
      projectRoot: "/tmp/current-project",
      userId,
    });
  });

  it("uses the global last active session for unauthenticated local MCP tool calls", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const sessionService = new SessionService(db);
      const registry = new ToolRegistry();
      const session = sessionService.create({
        name: "Local MCP Session",
        projectPath: "/tmp/local-project",
      });
      let capturedContext: { sessionId: string; projectRoot: string; userId?: string } | null = null;

      registry.register({
        name: "memory.search",
        description: "Search memory",
        tier: "standard",
        category: "memory",
        source: "builtin",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
        async execute(_input, context) {
          capturedContext = {
            sessionId: context.sessionId,
            projectRoot: context.projectRoot,
            userId: context.userId,
          };
          return { ok: true, message: "ok" };
        },
      });

      const app = Fastify();
      appsToClose.push(app);
      registerMcpRoutes(app, {
        toolRegistry: registry,
        sessionService,
        config: {
          host: "127.0.0.1",
          port: 3000,
          jwtSecret: "test-secret",
        } as any,
      });

      const response = await app.inject({
        method: "POST",
        url: "/mcp",
        headers: {
          "content-type": "application/json",
        },
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "memory.search",
            arguments: { query: "salary consulting" },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(capturedContext).toEqual({
        sessionId: session.id,
        projectRoot: "/tmp/local-project",
        userId: undefined,
      });
    } finally {
      sqlite.close();
    }
  });

  it("passes the authenticated user into MCP tool context when a session override is provided", async () => {
    const registry = new ToolRegistry();
    const token = await signAuthToken({ id: "user-456", username: "jakob" }, "test-secret");
    let capturedContext: { sessionId: string; projectRoot: string; userId?: string } | null = null;

    registry.register({
      name: "surfaces.list",
      description: "List surfaces",
      tier: "standard",
      category: "surfaces",
      source: "builtin",
      parameters: { type: "object", properties: {} },
      async execute(_input, context) {
        capturedContext = {
          sessionId: context.sessionId,
          projectRoot: context.projectRoot,
          userId: context.userId,
        };
        return { ok: true, message: "ok" };
      },
    });

    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: {
        host: "127.0.0.1",
        port: 3000,
        jwtSecret: "test-secret",
      } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp?sessionId=query-session&projectRoot=%2Ftmp%2Fquery-project",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "surfaces.list",
          arguments: {},
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedContext).toEqual({
      sessionId: "query-session",
      projectRoot: "/tmp/query-project",
      userId: "user-456",
    });
  });

  it("uses MCP URL query params as tool context overrides", async () => {
    const registry = new ToolRegistry();
    let capturedContext: {
      sessionId: string;
      projectRoot: string;
      userId?: string;
      providerId?: string;
      model?: string;
      runtimeMode?: string;
    } | null = null;

    registry.register({
      name: "surfaces.list",
      description: "List surfaces",
      tier: "standard",
      category: "surfaces",
      source: "builtin",
      parameters: { type: "object", properties: {} },
      async execute(_input, context) {
        capturedContext = {
          sessionId: context.sessionId,
          projectRoot: context.projectRoot,
          userId: context.userId,
          providerId: context.providerId,
          model: context.model,
          runtimeMode: context.runtimeMode,
        };
        return { ok: true, message: "ok" };
      },
    });

    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: {
        host: "127.0.0.1",
        port: 3000,
        jwtSecret: "test-secret",
      } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp?sessionId=query-session&projectRoot=%2Ftmp%2Fquery-project&providerId=codex&model=gpt-5-codex&runtimeMode=supervised",
      headers: {
        "content-type": "application/json",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "surfaces.list",
          arguments: {},
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedContext).toEqual({
      sessionId: "query-session",
      projectRoot: "/tmp/query-project",
      userId: undefined,
      providerId: "codex",
      model: "gpt-5-codex",
      runtimeMode: "supervised",
    });
  });

  it("uses MCP tool arguments as context overrides", async () => {
    const registry = new ToolRegistry();
    let capturedContext: {
      sessionId: string;
      projectRoot: string;
      providerId?: string;
      model?: string;
      runtimeMode?: string;
    } | null = null;

    registry.register({
      name: "memory.save",
      description: "Save memory",
      tier: "standard",
      category: "memory",
      source: "builtin",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          sessionId: { type: "string" },
          projectRoot: { type: "string" },
          providerId: { type: "string" },
          model: { type: "string" },
          runtimeMode: { type: "string" },
        },
        required: ["content"],
      },
      async execute(_input, context) {
        capturedContext = {
          sessionId: context.sessionId,
          projectRoot: context.projectRoot,
          providerId: context.providerId,
          model: context.model,
          runtimeMode: context.runtimeMode,
        };
        return { ok: true, message: "ok" };
      },
    });

    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: {
        host: "127.0.0.1",
        port: 3000,
        jwtSecret: "test-secret",
      } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "memory.save",
          arguments: {
            content: "remember this",
            sessionId: "argument-session",
            projectRoot: "/tmp/argument-project",
            providerId: "codex",
            model: "gpt-5-codex",
            runtimeMode: "supervised",
          },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedContext).toEqual({
      sessionId: "argument-session",
      projectRoot: "/tmp/argument-project",
      providerId: "codex",
      model: "gpt-5-codex",
      runtimeMode: "supervised",
    });
  });

  it("infers provider, model, and runtime mode from the referenced session state", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const sessionService = new SessionService(db);
      const userService = new UserService(db);
      const sessionState = new SessionStateService(db);
      const user = userService.createUser("codex-owner", "password123");
      userService.updateSettings(user.id, { chatProvider: "codex" });
      const session = sessionService.create({
        userId: user.id,
        name: "Codex Session",
        projectPath: "/tmp/current-project",
      });
      sessionState.set(session.id, {
        "chat.providerRuntimeMode": "supervised",
        "chat.cliModels": { codex: "gpt-5-codex" },
      });

      const registry = new ToolRegistry();
      let capturedContext: {
        sessionId: string;
        projectRoot: string;
        userId?: string;
        providerId?: string;
        model?: string;
        runtimeMode?: string;
      } | null = null;

      registry.register({
        name: "surfaces.list",
        description: "List surfaces",
        tier: "standard",
        category: "surfaces",
        source: "builtin",
        parameters: { type: "object", properties: {} },
        async execute(_input, context) {
          capturedContext = {
            sessionId: context.sessionId,
            projectRoot: context.projectRoot,
            userId: context.userId,
            providerId: context.providerId,
            model: context.model,
            runtimeMode: context.runtimeMode,
          };
          return { ok: true, message: "ok" };
        },
      });

      const app = Fastify();
      appsToClose.push(app);
      registerMcpRoutes(app, {
        toolRegistry: registry,
        sessionService,
        userService,
        sessionState,
        config: {
          host: "127.0.0.1",
          port: 3000,
          jwtSecret: "test-secret",
        } as any,
      });

      const response = await app.inject({
        method: "POST",
        url: `/mcp?sessionId=${encodeURIComponent(session.id)}`,
        headers: {
          "content-type": "application/json",
        },
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "surfaces.list",
            arguments: {},
          },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(capturedContext).toEqual({
        sessionId: session.id,
        projectRoot: "/tmp/current-project",
        userId: user.id,
        providerId: "codex",
        model: "gpt-5-codex",
        runtimeMode: "supervised",
      });
    } finally {
      sqlite.close();
    }
  });

  it("persists and broadcasts todo_list updates for MCP todo calls", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const sessionService = new SessionService(db);
      const sessionState = new SessionStateService(db);
      const userService = new UserService(db);
      const user = userService.createUser("mcp-todo-user", "password123");
      const session = sessionService.create({
        userId: user.id,
        name: "MCP Todo Session",
        projectPath: "/tmp/mcp-project",
      });

      const registry = new ToolRegistry();
      registry.register(createTodoTool());

      const wsEvents: Array<{ type: string; sessionId: string; payload?: unknown }> = [];
      const app = Fastify();
      appsToClose.push(app);
      registerMcpRoutes(app, {
        toolRegistry: registry,
        sessionService,
        userService,
        sessionState,
        ws: {
          broadcast(sessionId, event) {
            wsEvents.push({
              type: event.type,
              sessionId,
              payload: "payload" in event ? event.payload : undefined,
            });
          },
          broadcastAll() {},
        } as any,
        config: {
          host: "127.0.0.1",
          port: 3000,
          jwtSecret: "test-secret",
        } as any,
      });

      const response = await app.inject({
        method: "POST",
        url: `/mcp?sessionId=${encodeURIComponent(session.id)}`,
        headers: {
          "content-type": "application/json",
        },
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "todo",
            arguments: {
              todoList: [
                { id: 1, title: "Trace MCP sync", status: "in-progress" },
                { id: 2, title: "Verify todo render", status: "not-started" },
              ],
            },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(sessionState.get(session.id, ["todo_list"])).toEqual({
        todo_list: [
          { id: 1, title: "Trace MCP sync", status: "in-progress" },
          { id: 2, title: "Verify todo render", status: "not-started" },
        ],
      });
      expect(wsEvents).toEqual([
        {
          type: "ui.state-sync",
          sessionId: session.id,
          payload: {
            key: "todo_list",
            value: [
              { id: 1, title: "Trace MCP sync", status: "in-progress" },
              { id: 2, title: "Verify todo render", status: "not-started" },
            ],
          },
        },
      ]);
    } finally {
      sqlite.close();
    }
  });
});
