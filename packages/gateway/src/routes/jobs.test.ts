import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { SchedulerService } from "../scheduler/service.js";
import { signAuthToken } from "../security/http-auth.js";
import { registerJobRoutes } from "./jobs.js";

async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

describe("job routes", () => {
  it("creates and triggers agent_task automations via agent.spawn", async () => {
    const { db, sqlite } = openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { content: "done" } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const headers = await authHeader(config.jwtSecret, "agent-user");

    const createResponse = await app.inject({
      method: "POST",
      url: "/jobs",
      headers,
      payload: {
        name: "daily codex automation",
        cron_expression: "0 9 * * *",
        job_type: "agent_task",
        description: "create daily summary",
        prompt: "Lies den Repo-Status und schreibe ein Daily.",
        payload: { allowedTools: "file.list,file.read" },
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as { id: string; tool_name: string; prompt: string | null };
    expect(created.tool_name).toBe("agent.spawn");
    expect(created.prompt).toBe("Lies den Repo-Status und schreibe ein Daily.");

    const triggerResponse = await app.inject({
      method: "POST",
      url: `/jobs/${created.id}/trigger`,
      headers,
    });

    expect(triggerResponse.statusCode).toBe(200);
    expect(executeTool).toHaveBeenCalledOnce();
    expect(executeTool.mock.calls[0]?.[0]).toMatchObject({
      toolName: "agent.spawn",
      input: {
        prompt: "Lies den Repo-Status und schreibe ein Daily.",
        description: "create daily summary",
        allowedTools: "file.list,file.read",
      },
    });

    await app.close();
    sqlite.close();
  });

  it("rejects agent_task automations without prompt", async () => {
    const { db, sqlite } = openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { handled: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const headers = await authHeader(config.jwtSecret, "agent-user");

    const createResponse = await app.inject({
      method: "POST",
      url: "/jobs",
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
    const { db, sqlite } = openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { handled: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const headers = await authHeader(config.jwtSecret, "user-1");

    const createResponse = await app.inject({
      method: "POST",
      url: "/jobs",
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
      url: `/jobs/${created.id}/trigger`,
      headers,
    });
    expect(triggerResponse.statusCode).toBe(200);
    expect(executeTool).toHaveBeenCalledOnce();

    const runsResponse = await app.inject({
      method: "GET",
      url: `/jobs/${created.id}/runs`,
      headers,
    });
    expect(runsResponse.statusCode).toBe(200);
    const runsPayload = runsResponse.json() as { total: number; items: Array<{ status: string }> };
    expect(runsPayload.total).toBe(1);
    expect(runsPayload.items[0]?.status).toBe("completed");

    await app.close();
    sqlite.close();
  });

  it("does not allow one user to trigger another user's job", async () => {
    const { db, sqlite } = openDatabase(":memory:");
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
      url: "/jobs",
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
      url: `/jobs/${created.id}/trigger`,
      headers: userTwoHeaders,
    });

    expect(triggerAsOtherUser.statusCode).toBe(404);
    expect(executeTool).not.toHaveBeenCalled();

    await app.close();
    sqlite.close();
  });
});
