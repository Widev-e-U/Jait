import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { matchesCronMinute, SchedulerService } from "../scheduler/service.js";
import { signAuthToken } from "../security/http-auth.js";
import { registerJobRoutes } from "./jobs.js";

async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

describe("job routes", () => {
  it("creates and triggers agent_task automations as isolated delivery threads", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { content: "done" } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const headers = await authHeader(config.jwtSecret, "agent-user");

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers,
      payload: {
        name: "daily codex automation",
        cron_expression: "0 9 * * *",
        job_type: "agent_task",
        description: "create daily summary",
        prompt: "Lies den Repo-Status und schreibe ein Daily.",
        provider: "codex",
        model: "gpt-5-codex",
        payload: { allowedTools: "file.list,file.read", title: "fixed cron title" },
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as { id: string; tool_name: string; prompt: string | null; payload: Record<string, unknown> | null };
    expect(created.tool_name).toBe("thread.control");
    expect(created.prompt).toBe("Lies den Repo-Status und schreibe ein Daily.");
    expect(created.payload).not.toHaveProperty("title");

    const triggerResponse = await app.inject({
      method: "POST",
      url: `/api/jobs/${created.id}/trigger`,
      headers,
    });

    expect(triggerResponse.statusCode).toBe(200);
    expect(executeTool).toHaveBeenCalledOnce();
    expect(executeTool.mock.calls[0]?.[0]).toMatchObject({
      toolName: "thread.control",
      input: {
        action: "create",
        kind: "delivery",
        prompt: "Lies den Repo-Status und schreibe ein Daily.",
        providerId: "codex",
        start: true,
        detach: true,
      },
    });
    expect((executeTool.mock.calls[0]?.[0] as { input?: Record<string, unknown> }).input).not.toHaveProperty("title");

    await app.close();
    sqlite.close();
  });

  it("rejects agent_task automations without prompt", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { handled: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const headers = await authHeader(config.jwtSecret, "agent-user");

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers,
      payload: {
        name: "broken agent task",
        cron_expression: "* * * * *",
        job_type: "agent_task",
      },
    });

    expect(createResponse.statusCode).toBe(400);
    expect(createResponse.json()).toMatchObject({ detail: "prompt is required for agent_task" });

    await app.close();
    sqlite.close();
  });

  it("creates, triggers and lists runs for authenticated automation jobs", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { handled: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const headers = await authHeader(config.jwtSecret, "user-1");

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers,
      payload: {
        name: "status automation",
        cron_expression: "* * * * *",
        job_type: "system_job",
        payload: {
          command: "gateway_status",
          args: { source: "tests" },
        },
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as { id: string; tool_name: string };
    expect(created.tool_name).toBe("gateway.status");

    const triggerResponse = await app.inject({
      method: "POST",
      url: `/api/jobs/${created.id}/trigger`,
      headers,
    });
    expect(triggerResponse.statusCode).toBe(200);
    expect(executeTool).toHaveBeenCalledOnce();

    const runsResponse = await app.inject({
      method: "GET",
      url: `/api/jobs/${created.id}/runs`,
      headers,
    });
    expect(runsResponse.statusCode).toBe(200);
    const runsPayload = runsResponse.json() as { total: number; items: Array<{ status: string }> };
    expect(runsPayload.total).toBe(1);
    expect(runsPayload.items[0]?.status).toBe("completed");

    await app.close();
    sqlite.close();
  });

  it("lists persisted runs created by scheduled ticks", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, message: "scheduled", data: { handled: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const headers = await authHeader(config.jwtSecret, "user-1");
    const job = scheduler.create({
      userId: "user-1",
      name: "scheduled status automation",
      cron: "* * * * *",
      toolName: "gateway.status",
      input: {},
      sessionId: "default",
      projectRoot: process.cwd(),
    });

    await scheduler.tick(new Date("2026-05-12T12:34:00.000Z"));

    const runsResponse = await app.inject({
      method: "GET",
      url: `/api/jobs/${job.id}/runs`,
      headers,
    });

    expect(runsResponse.statusCode).toBe(200);
    const runsPayload = runsResponse.json() as {
      total: number;
      items: Array<{ status: string; triggered_by: string; result: string | null }>;
    };
    expect(runsPayload.total).toBe(1);
    expect(runsPayload.items[0]).toMatchObject({
      status: "completed",
      triggered_by: "schedule",
      result: JSON.stringify({ handled: true }),
    });

    await app.close();
    sqlite.close();
  });

  it("allows toggling enabled on an agent_task without re-validating the prompt", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { handled: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const headers = await authHeader(config.jwtSecret, "agent-user");

    const created = scheduler.create({
      userId: "agent-user",
      name: "legacy agent automation",
      cron: "0 9 * * *",
      toolName: "thread.control",
      input: {
        __jaitJobMeta: { jobType: "agent_task" },
      },
      sessionId: "default",
      projectRoot: process.cwd(),
    });

    const disableResponse = await app.inject({
      method: "PATCH",
      url: `/api/jobs/${created.id}`,
      headers,
      payload: { enabled: false },
    });

    expect(disableResponse.statusCode).toBe(200);
    expect(disableResponse.json()).toMatchObject({ enabled: false });

    const enableResponse = await app.inject({
      method: "PATCH",
      url: `/api/jobs/${created.id}`,
      headers,
      payload: { enabled: true },
    });

    expect(enableResponse.statusCode).toBe(200);
    expect(enableResponse.json()).toMatchObject({ enabled: true });

    await app.close();
    sqlite.close();
  });

  it("does not allow one user to trigger another user's job", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { handled: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const userOneHeaders = await authHeader(config.jwtSecret, "user-1");
    const userTwoHeaders = await authHeader(config.jwtSecret, "user-2");

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: userOneHeaders,
      payload: {
        name: "private automation",
        cron_expression: "* * * * *",
        payload: { command: "gateway.status", args: {} },
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as { id: string };

    const triggerAsOtherUser = await app.inject({
      method: "POST",
      url: `/api/jobs/${created.id}/trigger`,
      headers: userTwoHeaders,
    });

    expect(triggerAsOtherUser.statusCode).toBe(404);
    expect(executeTool).not.toHaveBeenCalled();

    await app.close();
    sqlite.close();
  });

  it("serves agent-created thread.control jobs as editable agent_task with prompt, provider and model", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { handled: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const headers = await authHeader(config.jwtSecret, "agent-user");

    // Simulate a job created by the agent via cron.add: tool_name + input only,
    // with no explicit prompt/provider/model columns.
    scheduler.create({
      userId: "agent-user",
      name: "Duplication check",
      cron: "0 6 * * *",
      toolName: "thread.control",
      input: {
        action: "create",
        kind: "delivery",
        detach: true,
        start: true,
        title: "Duplication check",
        prompt: "Check for duplicated memories and clean them up.",
        providerId: "claude-code",
        model: "claude-opus-4-6",
      },
    });

    const listResponse = await app.inject({ method: "GET", url: "/api/jobs", headers });
    expect(listResponse.statusCode).toBe(200);
    const listed = (listResponse.json() as { items: Array<Record<string, unknown>> }).items
      .find((job) => job.name === "Duplication check");
    expect(listed).toMatchObject({
      job_type: "agent_task",
      prompt: "Check for duplicated memories and clean them up.",
      provider: "claude-code",
      model: "claude-opus-4-6",
    });

    const detailResponse = await app.inject({ method: "GET", url: `/api/jobs/${listed?.id}`, headers });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      job_type: "agent_task",
      prompt: "Check for duplicated memories and clean them up.",
      provider: "claude-code",
      model: "claude-opus-4-6",
    });

    await app.close();
    sqlite.close();
  });

  it("serves agent.spawn jobs with an incomplete __jaitJobMeta blob as editable agent_task with prompt", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { handled: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const headers = await authHeader(config.jwtSecret, "agent-user");

    // Regression: cron.add (agent.spawn path) persists a __jaitJobMeta blob
    // that carries jobType/model/timeZone but NOT the prompt, which lives at
    // the top level of the input. The blob must not shadow the inferred
    // prompt/provider fields, otherwise the edit modal shows no prompt.
    scheduler.create({
      userId: "agent-user",
      name: "jade-code-duplication-audit",
      cron: "0 */2 * * *",
      toolName: "agent.spawn",
      input: {
        __jaitJobMeta: {
          jobType: "agent_task",
          model: "deepseek-v4-flash:0731-cloud",
          timeZone: "UTC",
        },
        prompt: "Audit the entire project for code duplication. Work in /home/jakob/jait.",
      },
    });

    const listResponse = await app.inject({ method: "GET", url: "/api/jobs", headers });
    expect(listResponse.statusCode).toBe(200);
    const listed = (listResponse.json() as { items: Array<Record<string, unknown>> }).items
      .find((job) => job.name === "jade-code-duplication-audit");
    expect(listed).toMatchObject({
      job_type: "agent_task",
      prompt: "Audit the entire project for code duplication. Work in /home/jakob/jait.",
      model: "deepseek-v4-flash:0731-cloud",
    });

    const detailResponse = await app.inject({ method: "GET", url: `/api/jobs/${listed?.id}`, headers });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      job_type: "agent_task",
      prompt: "Audit the entire project for code duplication. Work in /home/jakob/jait.",
      model: "deepseek-v4-flash:0731-cloud",
    });

    await app.close();
    sqlite.close();
  });

  it("matches daily jobs in their configured timezone", () => {
    const instant = new Date("2026-07-31T05:00:00.000Z");
    expect(matchesCronMinute("0 7 * * *", instant, "Europe/Berlin")).toBe(true);
    expect(matchesCronMinute("0 7 * * *", instant, "UTC")).toBe(false);
    expect(matchesCronMinute("0 7 * * *", instant, "Invalid/Timezone")).toBe(false);
  });
});
