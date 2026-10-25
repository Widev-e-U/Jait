import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { signAuthToken } from "../security/http-auth.js";
import { SessionStateService } from "../services/session-state.js";
import { SessionService } from "../services/sessions.js";
import { UserService } from "../services/users.js";
import { ThreadService } from "../services/threads.js";
import { TeamChatService } from "../services/team-chat.js";
import { createTeamChatTool } from "../tools/team-chat-tools.js";
import type { AppConfig } from "../config.js";
import type { ToolContext } from "../tools/contracts.js";
import { UserQuestionService } from "../services/user-questions.js";
import { createUserAskTool } from "../tools/user-question-tools.js";
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
  it.each([false, true])("requires browser calls to bind their chat instead of borrowing last-active (authenticated=%s)", async (authenticated) => {
    const owner = "browser-owner";
    const personal = { id: "personal-chat", userId: owner, projectPath: null };
    const project = { id: "project-chat", userId: owner, projectPath: "/project" };
    let active = project;
    const sessionService = {
      lastActive: vi.fn(() => active),
      getById: vi.fn((id: string) => id === personal.id ? personal : project),
    } as unknown as SessionService;
    const execute = vi.fn(async (_input: unknown, context: ToolContext) => ({
      ok: true, message: "browser opened", data: { sessionId: context.sessionId },
    }));
    const registry = new ToolRegistry();
    for (const name of ["browser.navigate", "browser.handoff", "preview.open", "surfaces.start"]) {
      registry.register({ name, description: "Browser session routing test", tier: "standard",
        category: name === "surfaces.start" ? "surfaces" : "browser", source: "builtin",
        parameters: { type: "object", properties: {} }, execute });
    }
    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, { toolRegistry: registry, sessionService,
      config: { host: "127.0.0.1", port: 3000, jwtSecret: "test-secret" } as AppConfig });
    const headers = authenticated
      ? { authorization: `Bearer ${await signAuthToken({ id: owner, username: owner }, "test-secret")}` } : {};
    for (const endpoint of ["/mcp", "/mcp/sse"]) {
      for (const name of ["browser_navigate", "browser_handoff", "preview_open", "surfaces_start"]) {
        const payload = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: { type: "browser" } } };
        const unbound = await app.inject({ method: "POST", url: endpoint, headers, payload });
        expect(unbound.json()).toMatchObject({ result: { isError: true } });
        expect(JSON.stringify(unbound.json())).toContain("explicit sessionId");
        expect(execute).not.toHaveBeenCalled();
        // A newer project conversation, or switching the last-active chat, must
        // never move browser actions or their handoff away from this personal chat.
        for (const selected of [project, personal, project]) {
          active = selected;
          const bound = await app.inject({ method: "POST", url: `${endpoint}?sessionId=${personal.id}`, headers, payload });
          expect(bound.json()).toMatchObject({ result: { isError: false } });
          expect(execute.mock.calls.at(-1)?.[1].sessionId).toBe(personal.id);
        }
        execute.mockClear();
      }
    }
  });

  it("keeps a user question resumable across MCP call deadlines", async () => {
    vi.useFakeTimers();
    try {
      const service = new UserQuestionService();
      const registry = new ToolRegistry();
      registry.register(createUserAskTool(service));
      const call = (args: unknown) => handleMcpRequest({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "user_ask", arguments: args },
      }, registry, undefined, { sessionId: "session-1", userId: "user-1" });
      const first = call({ questions: [{ id: "choice", header: "Choice", question: "Which one?" }] });
      await vi.advanceTimersByTimeAsync(60_000);
      const response = await first;
      expect(response).toMatchObject({ result: { isError: false } });
      const [request] = service.listPending();
      expect(JSON.stringify(response)).toContain(request!.id);
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      expect(service.submit(request!.id, { answers: { choice: { selected: ["yes"], freeText: null, skipped: false } } }, "user-1")).toBe(true);
      const answer = await call({ requestId: request!.id });
      expect(answer).toMatchObject({ result: { isError: false } });
      expect(JSON.stringify(answer)).toContain("yes");
      expect(service.listPending()).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pauses MCP actions until this chat's question is answered or cancelled", async () => {
    const app = Fastify();
    appsToClose.push(app);
    const questions = new UserQuestionService();
    const registry = new ToolRegistry();
    const mutate = vi.fn(async () => ({ ok: true, message: "changed" }));
    registry.register({ name: "file.write", tier: "standard", category: "filesystem", source: "builtin",
      description: "Test mutation", parameters: { type: "object", properties: {} }, execute: mutate });
    registry.register(createUserAskTool(questions));
    registerMcpRoutes(app, { toolRegistry: registry, userQuestionService: questions,
      config: { host: "127.0.0.1", port: 3000 } as AppConfig });
    const call = async (sessionId: string, name: string, args = {}) => (await app.inject({
      method: "POST", url: `/mcp?sessionId=${sessionId}`,
      payload: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    })).json();
    const id = questions.startResumable({ sessionId: "waiting-chat", questions: [], requestedBy: "user.ask" });
    const blocked = await call("waiting-chat", "file_write");
    expect(blocked.result.isError).toBe(true);
    expect(JSON.stringify(blocked)).toContain(id);
    expect(mutate).not.toHaveBeenCalled();
    expect((await call("another-chat", "file_write")).result.isError).toBe(false);
    expect(mutate).toHaveBeenCalledTimes(1);
    questions.submit(id, { answers: {} });
    expect((await call("waiting-chat", "user_ask", { requestId: id })).result.isError).toBe(false);
    expect((await call("waiting-chat", "file_write")).result.isError).toBe(false);
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it("keeps essential tools in a dedicated core MCP catalog", async () => {
    const registry = new ToolRegistry();
    for (const [name, tier] of [
      ["todo", "core"],
      ["user.ask", "core"],
      ["tools.search", "core"],
      ["jait.terminal", "standard"],
      ["terminal.run", "standard"],
    ] as const) {
      registry.register({
        name,
        description: name,
        tier,
        category: tier === "core" ? "meta" : "terminal",
        source: "builtin",
        parameters: { type: "object", properties: {} },
        async execute() {
          return { ok: true, message: "ok" };
        },
      });
    }

    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: { host: "127.0.0.1", port: 3000 } as any,
    });

    const listTools = async (toolSet: string) => {
      const response = await app.inject({
        method: "POST",
        url: `/mcp?toolSet=${toolSet}`,
        payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      });
      return response.json().result.tools.map((tool: { name: string }) => tool.name);
    };

    expect(await listTools("core")).toEqual(["todo", "user_ask", "tools_search", "jait_terminal"]);
    expect(await listTools("deferred")).toEqual(["terminal_run"]);

    const crossCatalogCall = await app.inject({
      method: "POST",
      url: "/mcp?toolSet=core&sessionId=session-1",
      payload: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "terminal_run", arguments: {} },
      },
    });
    expect(crossCatalogCall.json()).toMatchObject({
      result: {
        isError: true,
        content: [{ text: "Unknown tool: terminal.run" }],
      },
    });
  });

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
      name: "user.ask",
      description: "Ask the user one or more structured questions",
      tier: "core",
      category: "gateway",
      source: "builtin",
      risk: "low",
      parameters: {
        type: "object",
        properties: {
          questions: { type: "array" },
        },
        required: ["questions"],
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

    expect(listToolsForMcp(registry).map((tool) => tool.name)).toEqual(["jait.todos", "user.ask", "cron.add"]);

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
            name: "jait_todos",
            description: "Manage global Jait todo items",
            inputSchema: {
              type: "object",
              properties: {
                action: { type: "string", enum: ["list", "add", "update", "remove"] },
                todoId: { type: "string" },
              },
              required: ["action"],
            },
            annotations: {
              destructiveHint: true,
              readOnlyHint: true,
              idempotentHint: true,
            },
          },
          {
            name: "user_ask",
            description: "Ask the user one or more structured questions",
            inputSchema: {
              type: "object",
              properties: {
                questions: { type: "array" },
              },
              required: ["questions"],
            },
            annotations: {
              readOnlyHint: true,
              idempotentHint: true,
            },
          },
          {
            name: "cron_add",
            description: "Create a cron job",
            inputSchema: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
              required: ["name"],
            },
            annotations: {
              destructiveHint: true,
            },
          },
        ],
      },
    });
  });

  it("advertises human-friendly tool titles to MCP clients", async () => {
    const registry = new ToolRegistry();
    registry.register(createTodoTool());
    registry.register({
      name: "jait.terminal",
      displayName: "Terminal",
      description: "Run a command",
      tier: "standard",
      category: "terminal",
      source: "builtin",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });

    const response = await handleMcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }, registry);

    expect((response.result as { tools: Array<Record<string, unknown>> }).tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "todo", title: "Todo" }),
      expect.objectContaining({ name: "jait_terminal", title: "Terminal" }),
    ]));
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
        instructions: expect.stringContaining("Use tools_search"),
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

  it("streams MCP tool progress over the streamable HTTP response", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "jait.terminal",
      description: "Run a command",
      tier: "standard",
      category: "terminal",
      source: "builtin",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      async execute(_input, context) {
        context.onOutputChunk?.("first\n");
        context.onOutputChunk?.("second\n");
        return { ok: true, message: "done" };
      },
    });
    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: { host: "127.0.0.1", port: 3000 } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp?sessionId=session-1&projectRoot=%2Ftmp%2Fproject",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "jait_terminal",
          arguments: { command: "bun test" },
          _meta: { progressToken: "progress-1" },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain('"method":"notifications/progress"');
    expect(response.body).toContain('"message":"first\\n"');
    expect(response.body).toContain('"message":"second\\n"');
    expect(response.body).toContain('"id":1');
  });

  it("routes MCP terminal calls through the configured tool executor", async () => {
    const registry = new ToolRegistry();
    const directExecute = vi.fn(async () => ({ ok: true, message: "direct execution" }));
    registry.register({
      name: "jait.terminal",
      description: "Run a command",
      tier: "standard",
      category: "terminal",
      source: "builtin",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      execute: directExecute,
    });
    const toolExecutor = vi.fn(async () => ({ ok: true, message: "remote execution" }));
    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      toolExecutor,
      config: { host: "127.0.0.1", port: 3000 } as any,
    });

    const projectRoot = "E:\\TimeToAct\\EVN\\FSM.FunctionApps";
    const response = await app.inject({
      method: "POST",
      url: `/mcp?sessionId=remote-session&projectRoot=${encodeURIComponent(projectRoot)}`,
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "jait_terminal", arguments: { command: "pwd" } },
      },
    });

    expect(response.json()).toMatchObject({
      result: {
        content: [{ text: "remote execution" }],
        isError: false,
      },
    });
    expect(toolExecutor).toHaveBeenCalledWith(
      "jait.terminal",
      { command: "pwd" },
      expect.objectContaining({
        sessionId: "remote-session",
        projectRoot,
        requestedBy: "mcp-client",
      }),
    );
    expect(directExecute).not.toHaveBeenCalled();
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

  it("forwards MCP tool output chunks to the request progress callback", async () => {
    const registry = new ToolRegistry();
    const chunks: string[] = [];
    registry.register({
      name: "jait.terminal",
      description: "Run a command",
      tier: "standard",
      category: "terminal",
      source: "builtin",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      async execute(_input, context) {
        context.onOutputChunk?.("first\n");
        context.onOutputChunk?.("second\n");
        return { ok: true, message: "done" };
      },
    });

    await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "jait_terminal", arguments: { command: "bun test" } },
      },
      registry,
      "2025-03-26",
      { sessionId: "session-1", projectRoot: "/tmp/project" },
      undefined,
      (chunk) => chunks.push(chunk),
    );

    expect(chunks).toEqual(["first\n", "second\n"]);
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
    const token = await signAuthToken({ id: userId, username: "alice" }, "test-secret");
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
    const token = await signAuthToken({ id: "user-456", username: "alice" }, "test-secret");
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

  it.each(["/mcp", "/mcp/sse"])("resolves a worker's owner and execution context through %s", async (endpoint) => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const sessionService = new SessionService(db);
      const threadService = new ThreadService(db);
      // The most recent chat belongs to someone else; worker calls must keep
      // their own durable identity rather than adopting global chat defaults.
      sessionService.create({ userId: "other-user", name: "Unrelated chat" });
      const thread = threadService.create({
        userId: "worker-owner",
        personaAgentId: "developer",
        title: "Worker preflight",
        providerId: "codex",
        model: "gpt-5.5",
        runtimeMode: "supervised",
        workingDirectory: "/project/worker",
      });
      let capturedContext: ToolContext | undefined;
      const registry = new ToolRegistry();
      registry.register({
        name: "agent.github",
        description: "Inspect worker identity",
        parameters: { type: "object", properties: {} },
        async execute(_input, context) {
          capturedContext = context;
          return context.userId
            ? { ok: true, message: "Authenticated worker" }
            : { ok: false, message: "Authenticated user required." };
        },
      });
      registry.register(createTeamChatTool(new TeamChatService(db, sessionService, threadService), sessionService));
      const app = Fastify();
      appsToClose.push(app);
      registerMcpRoutes(app, {
        toolRegistry: registry, sessionService, threadService,
        config: { host: "127.0.0.1", port: 3000, jwtSecret: "test-secret" } as AppConfig,
      });
      const response = await app.inject({
        method: "POST",
        url: `${endpoint}?sessionId=${thread.id}`,
        payload: {
          jsonrpc: "2.0", id: 1, method: "tools/call",
          params: { name: "agent_github", arguments: {} },
        },
      });
      expect(response.json().result).toMatchObject({ isError: false });
      expect(capturedContext).toMatchObject({
        sessionId: thread.id,
        threadId: thread.id,
        userId: "worker-owner",
        projectRoot: "/project/worker",
        providerId: "codex",
        model: "gpt-5.5",
        runtimeMode: "supervised",
      });
      const teamResponse = await app.inject({
        method: "POST",
        url: `${endpoint}?sessionId=${thread.id}`,
        payload: {
          jsonrpc: "2.0", id: 2, method: "tools/call",
          params: { name: "team_chat", arguments: { action: "list" } },
        },
      });
      expect(teamResponse.json().result).toMatchObject({
        isError: false,
        content: [{ text: expect.stringContaining("Persistent team rooms.") }],
      });

      const token = await signAuthToken({ id: "other-user", username: "other" }, "test-secret");
      await app.inject({
        method: "POST",
        url: `${endpoint}?sessionId=${thread.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          jsonrpc: "2.0", id: 3, method: "tools/call",
          params: { name: "agent_github", arguments: {} },
        },
      });
      expect(capturedContext?.userId).toBe("other-user");
      expect(capturedContext?.threadId).toBeUndefined();
      expect(capturedContext?.providerId).toBeUndefined();
      expect(capturedContext?.projectRoot).not.toBe("/project/worker");
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
