import { describe, expect, it, vi } from "vitest";
import { openDatabase, migrateDatabase } from "./db/index.js";
import { SchedulerService } from "./scheduler/service.js";
import { HookBus, registerBuiltInHooks } from "./scheduler/hooks.js";
import Fastify from "fastify";
import { WsControlPlane } from "./ws.js";
import { registerHookRoutes } from "./routes/hooks.js";
import { SessionService } from "./services/sessions.js";
import { SurfaceRegistry } from "./surfaces/registry.js";
import { createToolRegistry } from "./tools/index.js";

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";


describe("Sprint 7 — Scheduling, Hooks & Webhooks", () => {
  it("creates/lists/updates/removes cron jobs and persists across service instances", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { ran: true } }));
    const schedulerA = new SchedulerService({ db, executeTool });

    const created = schedulerA.create({
      name: "daily-health",
      cron: "* * * * *",
      toolName: "gateway.status",
      input: { source: "test" },
      sessionId: "s1",
      workspaceRoot: "/workspace/Jait",
    });

    expect(schedulerA.list()).toHaveLength(1);
    expect(created.toolName).toBe("gateway.status");

    const updated = schedulerA.update(created.id, { enabled: false, name: "disabled-health" });
    expect(updated?.enabled).toBe(false);
    expect(updated?.name).toBe("disabled-health");

    const schedulerB = new SchedulerService({ db, executeTool });
    expect(schedulerB.list()).toHaveLength(1);
    expect(schedulerB.list()[0]?.name).toBe("disabled-health");

    const removed = schedulerB.remove(created.id);
    expect(removed).toBe(true);
    expect(schedulerB.list()).toHaveLength(0);

    sqlite.close();
  });

  it("runs matching cron jobs on tick and emits execution callback", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { ran: true } }));
    const onExecuted = vi.fn();
    const scheduler = new SchedulerService({ db, executeTool, onExecuted });

    const job = scheduler.create({
      name: "minutely",
      cron: "* * * * *",
      toolName: "gateway.status",
      input: {},
      sessionId: "s1",
      workspaceRoot: "/workspace/Jait",
    });

    await scheduler.tick(new Date("2026-03-02T10:15:00.000Z"));

    expect(executeTool).toHaveBeenCalledOnce();
    expect(onExecuted).toHaveBeenCalledOnce();

    const reloaded = scheduler.get(job.id);
    expect(reloaded?.lastRunAt).toBeTruthy();

    sqlite.close();
  });

  it("routes legacy scheduled agent.spawn jobs through thread.control isolation", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { thread: { id: "thread-1" } } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const job = scheduler.create({
      name: "legacy-agent-task",
      cron: "* * * * *",
      toolName: "agent.spawn",
      input: {
        prompt: "Run the nightly fix",
        description: "nightly fix",
        __jaitJobMeta: {
          jobType: "agent_task",
          provider: "codex",
          model: "gpt-5-codex",
        },
      },
      sessionId: "s1",
      workspaceRoot: "/workspace/Jait",
    });

    await scheduler.trigger(job.id);

    expect(executeTool).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "thread.control",
      sessionId: "s1",
      workspaceRoot: "/workspace/Jait",
      input: expect.objectContaining({
        action: "create",
        title: "nightly fix",
        kind: "delivery",
        workingDirectory: "/workspace/Jait",
        providerId: "codex",
        model: "gpt-5-codex",
        start: true,
        detach: true,
        prompt: "Run the nightly fix",
      }),
    }));

    sqlite.close();
  });

  it("matches zero-padded cron fields and avoids duplicate execution within one minute", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { ran: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    scheduler.create({
      name: "hourly-with-zero-padding",
      cron: "05 09 * * *",
      toolName: "gateway.status",
      input: {},
      sessionId: "s1",
      workspaceRoot: "/workspace/Jait",
    });

    const runAt = new Date("2026-03-02T09:05:00.000Z");
    await scheduler.tick(runAt);
    await scheduler.tick(runAt);

    expect(executeTool).toHaveBeenCalledTimes(1);

    sqlite.close();
  });

  it("fires wildcard hook listeners for lifecycle events", () => {
    const hooks = new HookBus();
    const surfaceHandler = vi.fn();

    hooks.on("surface.*", surfaceHandler);
    hooks.emit("surface.connected", { surfaceId: "t1" });
    hooks.emit("surface.exit", { surfaceId: "t1" });

    expect(surfaceHandler).toHaveBeenCalledTimes(2);
  });

  it("fires session.start built-in hook and loads bootstrap files", () => {
    const hooks = new HookBus();
    const workspaceRoot = join(tmpdir(), `jait-sprint7-${Date.now()}`);
    mkdirSync(join(workspaceRoot, ".jait"), { recursive: true });
    writeFileSync(join(workspaceRoot, ".jait", "bootstrap.md"), "# Bootstrap\nload me");

    const bootstrapSpy = vi.fn();
    hooks.on("session.bootstrap.loaded", bootstrapSpy);
    registerBuiltInHooks(hooks, { defaultWorkspaceRoot: workspaceRoot });

    hooks.emit("session.start", { sessionId: "s-bootstrap", workspaceRoot });

    expect(bootstrapSpy).toHaveBeenCalledOnce();
    const payload = bootstrapSpy.mock.calls[0]?.[0]?.payload as {
      fileCount: number;
      files: Array<{ path: string; content: string }>;
    };
    expect(payload.fileCount).toBe(1);
    expect(payload.files[0]?.path).toBe(".jait/bootstrap.md");
  });

  it("accepts authorized webhook posts for /hooks/wake and /hooks/agent", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const hooks = new HookBus();
    const wakeSpy = vi.fn(async () => ({ woke: true }));
    const agentSpy = vi.fn(async () => ({ accepted: true }));

    const app = Fastify();
    registerHookRoutes(app, {
      hooks,
      hookSecret: "secret-token",
      onWake: wakeSpy,
      onAgentHook: agentSpy,
    });

    const denied = await app.inject({ method: "POST", url: "/hooks/wake" });
    expect(denied.statusCode).toBe(401);

    const wake = await app.inject({
      method: "POST",
      url: "/hooks/wake",
      headers: { "x-hook-token": "secret-token" },
    });
    expect(wake.statusCode).toBe(200);
    expect(wakeSpy).toHaveBeenCalledOnce();

    const agent = await app.inject({
      method: "POST",
      url: "/hooks/agent",
      headers: { "x-hook-token": "secret-token" },
      payload: { kind: "external-trigger" },
    });
    expect(agent.statusCode).toBe(200);
    expect(agentSpy).toHaveBeenCalledOnce();

    await app.close();
    sqlite.close();
  });

  it("registers gateway.status and cron tools in tool registry", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const sessionService = new SessionService(db);
    sessionService.create({ name: "Active Session" });

    const ws = new WsControlPlane({
      port: 8000,
      wsPort: 0,
      host: "127.0.0.1",
      logLevel: "silent",
      corsOrigin: "*",
      nodeEnv: "development",
      jwtSecret: "secret",
      llmProvider: "ollama",
      ollamaUrl: "http://localhost:11434",
      ollamaModel: "model",
      openaiApiKey: "",
      openaiModel: "gpt-4o",
      openaiBaseUrl: "https://api.openai.com/v1",
      hookSecret: "secret",
      heartbeatCron: "* * * * *",
    });
    const surfaceRegistry = new SurfaceRegistry();
    const hooks = new HookBus();
    registerBuiltInHooks(hooks);

    const scheduler = new SchedulerService({
      db,
      executeTool: async () => ({ ok: true, data: { noop: true } }),
    });

    const tools = createToolRegistry(surfaceRegistry, {
      scheduler,
      sessionService,
      ws,
      startedAt: Date.now() - 2_000,
      hooks,
    });

    expect(tools.listNames()).toContain("cron.add");
    expect(tools.listNames()).toContain("cron.list");
    expect(tools.listNames()).toContain("cron.remove");
    expect(tools.listNames()).toContain("cron.update");
    expect(tools.listNames()).toContain("gateway.status");

    const status = await tools.execute("gateway.status", {}, {
      actionId: "a1",
      sessionId: "s1",
      workspaceRoot: "/workspace/Jait",
      requestedBy: "test",
    });

    expect(status.ok).toBe(true);
    const statusData = status.data as {
      healthy: boolean;
      scheduler?: { totalJobs: number; enabledJobs: number };
      hooks?: { registeredEventTypes: string[]; listeners: number };
      activeServices: string[];
    };
    expect(statusData.healthy).toBe(true);
    expect(statusData.activeServices).toContain("hooks");
    expect(statusData.scheduler?.totalJobs).toBe(0);
    expect(statusData.hooks?.registeredEventTypes).toContain("session.start");

    sqlite.close();
  });
});
