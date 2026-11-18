import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { messages } from "../db/schema.js";
import { ProjectService } from "../services/projects.js";
import { SessionService } from "../services/sessions.js";
import { SessionStateService } from "../services/session-state.js";
import { ThreadService } from "../services/threads.js";
import { UserService } from "../services/users.js";
import { ProviderRegistry } from "../providers/registry.js";
import { createProjectChatTool } from "./project-chat-tool.js";
import { ASK_MODE_TOOLS, MUTATING_TOOLS } from "./chat-modes.js";

const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", jwtSecret: "project-chat-test-secret" };
afterEach(() => vi.unstubAllGlobals());

describe("project.chat.create", () => {
  it("requires plan approval and is unavailable in read-only ask mode", () => {
    expect(MUTATING_TOOLS.has("project.chat.create")).toBe(true);
    expect(ASK_MODE_TOOLS.has("project.chat.create")).toBe(false);
  });
  it("creates a separate project chat, persists the exact message and starts the selected model through the real chat route", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db);
    const projectService = new ProjectService(db);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const user = userService.createUser("project-chat-test", "password123");
    userService.updateSettings(user.id, { jaitBackend: "openrouter", apiKeys: { OPENROUTER_API_KEY: "fixture" } });
    const origin = sessionService.create({ userId: user.id, name: "Personal" });
    sessionState.set(origin.id, { "chat.provider": "jait", "chat.cliModels": { jait: "openai/gpt-4o" }, "chat.providerRuntimeMode": "supervised" });
    const root = fileURLToPath(new URL("../../../../", import.meta.url));
    const project = projectService.create({ userId: user.id, title: "Target", rootPath: root, nodeId: "gateway" });
    let release = () => {};
    const done = new Promise<void>(resolve => { release = resolve; });
    const requests: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({ async start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"working"},"finish_reason":null}]}\n\n'));
        await done;
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
        controller.close();
      } }), { headers: { "Content-Type": "text/event-stream" } });
    }));
    const app = await createServer(config, { db, sqlite, userService, projectService, sessionService, sessionStateService: sessionState });
    const tool = createProjectChatTool({ projectService, sessionService, sessionState, userService, threadService: new ThreadService(db), providerRegistry: new ProviderRegistry(), config, getApp: () => app });
    const message = "  Please fix this.\nPreserve this exact second line.\n";
    try {
      const result = await tool.execute({ projectId: project.id, title: "Follow-up", message }, { userId: user.id, sessionId: origin.id, projectRoot: root, actionId: "test", requestedBy: "test" });
      expect(result.ok, result.message).toBe(true);
      const data = result.data as { session: { id: string }; href: string; accepted: boolean };
      expect(data.session.id).not.toBe(origin.id);
      expect(data.href).toBe(`/chat?sessionId=${data.session.id}`);
      expect(sessionService.getById(origin.id, user.id)?.projectId).toBeNull();
      expect(sessionService.listByProject(project.id).map(chat => chat.id)).toEqual([data.session.id]);
      expect(sessionState.get(data.session.id)).toMatchObject({ "chat.provider": "jait", "chat.cliModels": { jait: "openai/gpt-4o" }, "chat.providerRuntimeMode": "supervised" });
      await vi.waitFor(() => {
        const rows = db.select().from(messages).where(eq(messages.sessionId, data.session.id)).all();
        expect(rows.find(row => row.role === "user")?.content).toBe(message);
        expect(requests.length).toBeGreaterThan(0);
      });
      expect(requests[0]).toMatchObject({ model: "openai/gpt-4o" });
      expect(JSON.stringify(requests[0])).toContain("Please fix this.");
      release();
      await vi.waitFor(() => expect(db.select().from(messages).where(eq(messages.sessionId, data.session.id)).all().some(row => row.role === "assistant")).toBe(true));
    } finally {
      release();
      await app.close();
      sqlite.close();
    }
  });

  it("passes explicit provider, model and effort to an independent live chat", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db), projectService = new ProjectService(db), sessionService = new SessionService(db), sessionState = new SessionStateService(db);
    const user = userService.createUser("project-chat-effort", "password123");
    const source = sessionService.create({ userId: user.id, name: "Origin" });
    sessionState.set(source.id, { "chat.provider": "jait", "chat.cliModels": { jait: "old" }, "chat.reasoningEffort": "low" });
    const project = projectService.create({ userId: user.id, rootPath: fileURLToPath(new URL("../../../../", import.meta.url)), nodeId: "gateway" });
    const app = Fastify();
    let submitted: any;
    app.post("/api/chat", async (request, reply) => { submitted = request.body; return reply.type("text/event-stream").send('data: {"type":"request"}\n\n'); });
    const tool = createProjectChatTool({ projectService, sessionService, sessionState, userService, threadService: new ThreadService(db), providerRegistry: new ProviderRegistry(), config, getApp: () => app });
    try {
      const result = await tool.execute({ projectId: project.id, message: "hello", providerId: "codex", model: "gpt-test", reasoningEffort: "ultra" }, { userId: user.id, sessionId: source.id, actionId: "test", requestedBy: "test" });
      expect(result.ok).toBe(true);
      const session = (result.data as { session: { id: string } }).session;
      expect(submitted).toMatchObject({ sessionId: session.id, provider: "codex", model: "gpt-test", reasoningEffort: "ultra" });
      expect(sessionState.get(session.id)).toMatchObject({ "chat.provider": "codex", "chat.cliModels": { codex: "gpt-test" }, "chat.reasoningEffort": "ultra" });
      expect(sessionService.getById(source.id, user.id)?.projectId).toBeNull();
      expect(sessionState.get(source.id)).toMatchObject({ "chat.reasoningEffort": "low" });
    } finally { await app.close(); sqlite.close(); }
  });

  it("reports a rejected submission without falling back to a thread or moving the source chat", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db), projectService = new ProjectService(db), sessionService = new SessionService(db);
    const user = userService.createUser("project-chat-reject", "password123");
    const source = sessionService.create({ userId: user.id, name: "Source" });
    const project = projectService.create({ userId: user.id, rootPath: fileURLToPath(new URL("../../../../", import.meta.url)), nodeId: "gateway" });
    const app = Fastify();
    app.post("/api/chat", async (_request, reply) => reply.code(503).send({ error: "unavailable" }));
    const threadService = new ThreadService(db);
    const tool = createProjectChatTool({ projectService, sessionService, userService, threadService, providerRegistry: new ProviderRegistry(), config, getApp: () => app });
    try {
      const result = await tool.execute({ projectId: project.id, message: "hello", providerId: "codex" }, { userId: user.id, sessionId: source.id, projectRoot: project.rootPath!, actionId: "test", requestedBy: "test" });
      expect(result.ok).toBe(false);
      expect(result.message).toContain("HTTP 503");
      const data = result.data as { session: { id: string }; accepted: boolean };
      expect(data.accepted).toBe(false);
      expect(threadService.listBySession(data.session.id)).toHaveLength(0);
      expect(sessionService.getById(source.id, user.id)?.projectId).toBeNull();
    } finally { await app.close(); sqlite.close(); }
  });

  it("honors cancellation before creating a chat or submitting its first message", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db), projectService = new ProjectService(db), sessionService = new SessionService(db);
    const user = userService.createUser("project-chat-cancel", "password123");
    const project = projectService.create({ userId: user.id, rootPath: fileURLToPath(new URL("../../../../", import.meta.url)), nodeId: "gateway" });
    const app = Fastify();
    const post = vi.fn(async (_request, reply) => reply.code(503).send());
    app.post("/api/chat", post);
    const tool = createProjectChatTool({ projectService, sessionService, userService, threadService: new ThreadService(db), providerRegistry: new ProviderRegistry(), config, getApp: () => app });
    const controller = new AbortController();
    const context = { userId: user.id, projectRoot: project.rootPath!, actionId: "test", requestedBy: "test", signal: controller.signal };
    try {
      controller.abort();
      const cancelled = await tool.execute({ projectId: project.id, message: "hello", providerId: "codex" }, context);
      expect(cancelled.ok).toBe(false);
      expect(sessionService.listByProject(project.id)).toHaveLength(0);

      const later = new AbortController();
      const pending = tool.execute({ projectId: project.id, message: "hello", providerId: "codex" }, { ...context, signal: later.signal });
      later.abort();
      const result = await pending;
      expect(result.ok).toBe(false);
      expect(result.message).toContain("cancelled before it started");
      expect(result.data).toMatchObject({ accepted: false });
      expect(sessionService.listByProject(project.id)).toHaveLength(1);
      expect(post).not.toHaveBeenCalled();
    } finally { await app.close(); sqlite.close(); }
  });

  it("reports an unknown submission after cancellation while awaiting acceptance", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db), projectService = new ProjectService(db), sessionService = new SessionService(db);
    const user = userService.createUser("project-chat-inflight", "password123");
    const project = projectService.create({ userId: user.id, rootPath: fileURLToPath(new URL("../../../../", import.meta.url)), nodeId: "gateway" });
    const app = Fastify();
    let reportStarted = () => {};
    const started = new Promise<void>(resolve => { reportStarted = resolve; });
    let release = () => {};
    const done = new Promise<void>(resolve => { release = resolve; });
    app.post("/api/chat", async (_request, reply) => {
      reply.hijack();
      reply.raw.writeHead(200, { "Content-Type": "text/event-stream" });
      reply.raw.write(": waiting\n\n");
      reportStarted();
      await done;
      reply.raw.end();
    });
    const tool = createProjectChatTool({ projectService, sessionService, userService, threadService: new ThreadService(db), providerRegistry: new ProviderRegistry(), config, getApp: () => app });
    const controller = new AbortController();
    try {
      const pending = tool.execute({ projectId: project.id, message: "hello", providerId: "codex" }, { userId: user.id, projectRoot: project.rootPath!, actionId: "test", requestedBy: "test", signal: controller.signal });
      await started;
      controller.abort();
      const result = await pending;
      expect(result.ok).toBe(false);
      expect(result.data).toMatchObject({ accepted: null });
      expect(result.message).toContain("unknown");
    } finally { release(); await app.close(); sqlite.close(); }
  });

  it("does not create a chat in another user's project", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db), projectService = new ProjectService(db), sessionService = new SessionService(db);
    const owner = userService.createUser("project-chat-owner", "password123");
    const other = userService.createUser("project-chat-other", "password123");
    const project = projectService.create({ userId: owner.id, rootPath: fileURLToPath(new URL("../../../../", import.meta.url)), nodeId: "gateway" });
    const app = Fastify();
    const tool = createProjectChatTool({ projectService, sessionService, userService, threadService: new ThreadService(db), providerRegistry: new ProviderRegistry(), config, getApp: () => app });
    try {
      const result = await tool.execute({ projectId: project.id, message: "hello", providerId: "codex" }, { userId: other.id, projectRoot: project.rootPath!, actionId: "test", requestedBy: "test" });
      expect(result.ok).toBe(false);
      expect(sessionService.listByProject(project.id)).toHaveLength(0);
    } finally { await app.close(); sqlite.close(); }
  });
});
