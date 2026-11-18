import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { createFileListTool, createFilePatchTool, createFileReadTool, createFileWriteTool } from "../tools/file-tools.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanTask } from "@jait/shared";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { signAuthToken } from "../security/http-auth.js";
import { inertWorkspaces } from "../services/orchestration/inert-workspaces.js";
import { OrchestrationService } from "../services/orchestration/orchestrator.js";
import { createServer } from "../server.js";
import type { UserService } from "../services/users.js";
import { ToolRegistry } from "../tools/registry.js";
import { PlanService } from "../services/plans.js";
import { RepositoryService } from "../services/repositories.js";
import { registerPlanRoutes } from "./plans.js";

const owner = "owner";
const config = { ...loadConfig(), jwtSecret: "plan-runs-test-secret" };
const task: PlanTask = {
  id: "analyze",
  title: "Analyze project",
  description: "Inspect the project",
  status: "approved",
  verification: [{ id: "output", label: "Result exists", check: { kind: "artifact", path: "result.txt" } }],
};

async function auth(userId: string) {
  const token = await signAuthToken({ id: userId, username: userId }, config.jwtSecret);
  return { authorization: `Bearer ${token}` };
}

describe("plan run routes", () => {
  let app: ReturnType<typeof Fastify>;
  let database: Awaited<ReturnType<typeof openDatabase>>;
  let orchestration: OrchestrationService;
  let planService: PlanService;
  let planId: string;
  let halted: boolean;

  beforeEach(async () => {
    database = await openDatabase(":memory:");
    migrateDatabase(database.sqlite);
    app = Fastify();
    halted = false;
    const repoService = new RepositoryService(database.db);
    planService = new PlanService(database.db);
    const repo = repoService.create({ userId: owner, name: "repo", localPath: process.cwd() });
    planId = planService.create({ userId: owner, repoId: repo.id, title: "Plan", tasks: [task] }).id;
    orchestration = new OrchestrationService({
      db: database.db,
      workspaces: inertWorkspaces,
      isHalted: () => halted,
      executor: {
        execute: ({ signal, recordAgentRef, attemptNo }) => {
          recordAgentRef?.(`worker-${attemptNo}`);
          return new Promise((_, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
        },
      },
    });
    registerPlanRoutes(app, config, { planService, repoService, orchestration });
  });

  afterEach(async () => {
    orchestration.stopForUser(owner);
    await orchestration.settle();
    await app.close();
    database.sqlite.close();
  });

  it("starts a run, exposes its tasks only to the owner, and cancels it", async () => {
    const headers = await auth(owner);
    const start = await app.inject({ method: "POST", url: `/api/plans/${planId}/runs`, headers, payload: {} });
    expect(start.statusCode).toBe(201);
    const url = `/api/plan-runs/${start.json().run.id}`;
    const inspect = await app.inject({ method: "GET", url, headers });
    expect(inspect.json().run.tasks).toMatchObject([{ taskId: task.id, state: "running" }]);
    const outsider = await auth("outsider");
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url, headers: outsider })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `${url}/cancel`, headers: outsider })).statusCode).toBe(404);
    const cancel = await app.inject({ method: "POST", url: `${url}/cancel`, headers });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().run.status).toBe("cancelled");
  });

  it("rejects unknown owners, unapproved tasks, and a global halt", async () => {
    const url = `/api/plans/${planId}/runs`;
    expect((await app.inject({ method: "POST", url, headers: await auth("outsider"), payload: {} })).statusCode).toBe(404);
    const headers = await auth(owner);
    planService.update(planId, { tasks: [{ ...task, status: "proposed" }] });
    const unapproved = await app.inject({ method: "POST", url, headers, payload: {} });
    expect(unapproved.statusCode).toBe(400);
    expect(unapproved.json().issues).toMatchObject([{ code: "task_not_approved" }]);
    halted = true;
    expect((await app.inject({ method: "POST", url, headers, payload: {} })).statusCode).toBe(409);
    expect(orchestration.listRuns(owner)).toHaveLength(0);
  });

  it("requires a valid inspection decision before resuming an interrupted attempt", async () => {
    const headers = await auth(owner);
    const run = orchestration.createRun(owner, { planId });
    // Wait until the worker has started, so the halt interrupts a running attempt with its worker identity.
    await new Promise((resolve) => setTimeout(resolve, 0));
    orchestration.stopForUser(owner);
    await orchestration.settle();
    const request = { method: "POST" as const, url: `/api/plan-runs/${run.id}/resume`, headers };
    expect((await app.inject({ ...request, payload: {} })).statusCode).toBe(409);
    expect((await app.inject({ ...request, payload: { decisions: [{}] } })).statusCode).toBe(400);
    const resumed = await app.inject({ ...request, payload: { decisions: [{ taskId: task.id, decision: "retry", note: "Checked workspace" }] } });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().run.tasks).toMatchObject([{ taskId: task.id, state: "running", attemptCount: 2 }]);
    const url = `/api/plan-runs/${run.id}/tasks/${task.id}/attempts`;
    // The resumed attempt prepares its workspace before the worker starts, so let that step finish first.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const history = await app.inject({ url, headers });
    expect(history.statusCode).toBe(200);
    expect(history.json().attempts).toMatchObject([
      { attemptNo: 1, state: "interrupted", agentRef: "worker-1", finishedAt: expect.any(String) },
      { attemptNo: 2, state: "running", agentRef: "worker-2", finishedAt: null },
    ]);
    expect((await app.inject({ url, headers: await auth("outsider") })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/plan-runs/${run.id}/tasks/missing/attempts`, headers })).statusCode).toBe(404);
  });

  it("lists only the owner's runs", async () => {
    const headers = await auth(owner);
    const run = orchestration.createRun(owner, { planId });
    const listed = await app.inject({ url: "/api/plan-runs", headers });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().runs.map((item: { id: string }) => item.id)).toContain(run.id);
    const others = await app.inject({ url: "/api/plan-runs", headers: await auth("outsider") });
    expect(others.json().runs).toEqual([]);
  });

  it("shows task dependencies, the running worker and a pending dependent over HTTP, and cancels cleanly", async () => {
    const headers = await auth(owner);
    const repo = new RepositoryService(database.db).create({ userId: owner, name: "chain", localPath: process.cwd() });
    const chained = planService.create({
      userId: owner,
      repoId: repo.id,
      title: "Chain",
      tasks: [task, { ...task, id: "write", title: "Write report", dependsOn: ["analyze"] }],
    });
    const start = await app.inject({ method: "POST", url: `/api/plans/${chained.id}/runs`, headers, payload: {} });
    expect(start.statusCode).toBe(201);
    const runId = start.json().run.id;
    await expect.poll(async () => (await app.inject({ url: `/api/plan-runs/${runId}`, headers })).json().run.tasks[0].agentRef).toBe("worker-1");

    const view = (await app.inject({ url: `/api/plan-runs/${runId}`, headers })).json().run;
    expect(view.tasks).toMatchObject([
      { taskId: "analyze", state: "running", dependsOn: [], agentRef: "worker-1" },
      { taskId: "write", state: "pending", dependsOn: ["analyze"], agentRef: null },
    ]);
    const attempts = await app.inject({ url: `/api/plan-runs/${runId}/tasks/analyze/attempts`, headers });
    expect(attempts.json().attempts).toMatchObject([{ attemptNo: 1, state: "running", agentRef: "worker-1" }]);

    const cancelled = await app.inject({ method: "POST", url: `/api/plan-runs/${runId}/cancel`, headers });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().run).toMatchObject({ status: "cancelled" });
    expect(cancelled.json().run.tasks.map((item: { state: string }) => item.state)).toEqual(["cancelled", "cancelled"]);
  });
});


describe("gateway workflow composition", () => {
  it("starts an approved run through the real worker and persists the verified outcome", async () => {
    const database = await openDatabase(":memory:");
    migrateDatabase(database.sqlite);
    const repoService = new RepositoryService(database.db);
    const planService = new PlanService(database.db);
    const repo = repoService.create({ userId: owner, name: "repo", localPath: import.meta.dirname });
    const plan = planService.create({ userId: owner, repoId: repo.id, title: "Plan", tasks: [{
      ...task,
      resources: {},
      verification: [{ id: "file", label: "Fixture exists", check: { kind: "artifact", path: "plan-runs.test.ts" } }],
    }] });
    const workerFetch = vi.fn(async (_url: string, init: RequestInit) => {
      const { messages } = JSON.parse(String(init.body));
      const prompt: string = messages.find((message: { role: string }) => message.role === "user").content;
      const contract = prompt.split("\n").find((line) => line.startsWith('{"taskId":'));
      const report = { ...JSON.parse(contract!), summary: "Fixture completed" };
      return new Response([
        `data: ${JSON.stringify({ choices: [{ delta: { content: `[INFORM] ${JSON.stringify(report)}` } }] })}\n\n`,
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ].join(""), { headers: { "Content-Type": "text/event-stream" } });
    });
    const userService = {
      findById: (id: string) => id === owner ? { id } : undefined,
      getSettings: () => ({
        chatProvider: "jait", jaitBackend: "openai", selectedModel: "fixture-model",
        apiKeys: { OPENAI_API_KEY: "fixture-key", OPENAI_BASE_URL: "https://fixture.example.test/v1" },
      }),
    } as unknown as UserService;
    vi.stubGlobal("fetch", workerFetch);
    let app: Awaited<ReturnType<typeof createServer>> | undefined;
    try {
      const gateway = await createServer(config, {
        db: database.db, repoService, planService, userService, toolRegistry: new ToolRegistry(),
      });
      app = gateway;
      const headers = await auth(owner);
      const start = await gateway.inject({ method: "POST", url: `/api/plans/${plan.id}/runs`, headers, payload: {} });
      expect(start.statusCode, start.body).toBe(201);
      const url = `/api/plan-runs/${start.json().run.id}`;
      await expect.poll(async () => (await gateway.inject({ url, headers })).json().run.status).toBe("passed");
      const history = await gateway.inject({ url: `${url}/tasks/${task.id}/attempts`, headers });
      expect(history.statusCode).toBe(200);
      expect(history.json().attempts).toMatchObject([{
        attemptNo: 1, state: "passed", agentRef: expect.any(String),
        result: { summary: "Fixture completed" }, verification: [{ gateId: "file", passed: true }],
      }]);
      expect(workerFetch).toHaveBeenCalledTimes(1);
    } finally {
      await app?.close();
      vi.unstubAllGlobals();
      database.sqlite.close();
    }
  });

  it("offers a writing task only the file tools for its worktree, and runs it there", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "jait-state-"));
    const repoDir = await mkdtemp(join(tmpdir(), "jait-repo-"));
    const previousStateDir = process.env["JAIT_STATE_DIR"];
    process.env["JAIT_STATE_DIR"] = stateDir;
    const database = await openDatabase(":memory:");
    migrateDatabase(database.sqlite);
    let app: Awaited<ReturnType<typeof createServer>> | undefined;
    try {
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repoDir });
      await writeFile(join(repoDir, "README.md"), "project\n");
      execFileSync("git", ["add", "README.md"], { cwd: repoDir });
      execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-q", "-m", "base"], { cwd: repoDir });

      const repoService = new RepositoryService(database.db);
      const planService = new PlanService(database.db);
      const repo = repoService.create({ userId: owner, name: "repo", localPath: repoDir });
      const plan = planService.create({ userId: owner, repoId: repo.id, title: "Writer plan", tasks: [{
        ...task,
        resources: { writes: ["docs/writer.md"] },
        verification: [{ id: "readme", label: "README exists", check: { kind: "artifact", path: "README.md" } }],
      }] });
      const workerFetch = vi.fn(async (_url: string, init: RequestInit) => {
        const { messages } = JSON.parse(String(init.body));
        const prompt: string = messages.find((message: { role: string }) => message.role === "user").content;
        const contract = prompt.split("\n").find((line) => line.startsWith('{"taskId":'));
        const report = { ...JSON.parse(contract!), summary: "Writer answered without changes" };
        return new Response([
          `data: ${JSON.stringify({ choices: [{ delta: { content: `[INFORM] ${JSON.stringify(report)}` } }] })}\n\n`,
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
          "data: [DONE]\n\n",
        ].join(""), { headers: { "Content-Type": "text/event-stream" } });
      });
      const userService = {
        findById: (id: string) => id === owner ? { id } : undefined,
        getSettings: () => ({
          chatProvider: "jait", jaitBackend: "openai", selectedModel: "fixture-model",
          apiKeys: { OPENAI_API_KEY: "fixture-key", OPENAI_BASE_URL: "https://fixture.example.test/v1" },
        }),
      } as unknown as UserService;
      // The real file tools, registered the way the gateway registers them. Their surface registry is only used when a tool runs.
      const toolRegistry = new ToolRegistry();
      const surfaces = {} as never;
      for (const tool of [createFileReadTool(surfaces), createFileListTool(surfaces), createFileWriteTool(surfaces), createFilePatchTool(surfaces)]) {
        toolRegistry.register(tool);
      }
      vi.stubGlobal("fetch", workerFetch);
      const toolExecutor = vi.fn(async () => ({ ok: false, message: "not used by this fixture" }));
      const gateway = await createServer(config, {
        db: database.db, repoService, planService, userService, toolRegistry, toolExecutor,
      });
      app = gateway;
      const headers = await auth(owner);
      const start = await gateway.inject({ method: "POST", url: `/api/plans/${plan.id}/runs`, headers, payload: {} });
      expect(start.statusCode, start.body).toBe(201);
      const url = `/api/plan-runs/${start.json().run.id}`;
      await expect.poll(async () => (await gateway.inject({ url, headers })).json().run.status).toBe("passed");

      // The model was offered exactly the four write tools, under their provider-safe names (dots become underscores).
      expect(workerFetch).toHaveBeenCalledTimes(1);
      const offered = JSON.parse(String(workerFetch.mock.calls[0]?.[1]?.body)).tools as Array<{ function: { name: string } }>;
      expect(offered.map((tool) => tool.function.name).sort()).toEqual(["file_list", "file_patch", "file_read", "file_write"]);

      const history = await gateway.inject({ url: `${url}/tasks/${task.id}/attempts`, headers });
      expect(history.json().attempts).toMatchObject([{
        attemptNo: 1,
        state: "passed",
        agentRef: expect.any(String),
        worktreeRef: expect.stringContaining(join(stateDir, "worktrees", "workflows")),
      }]);
    } finally {
      await app?.close();
      vi.unstubAllGlobals();
      database.sqlite.close();
      if (previousStateDir === undefined) delete process.env["JAIT_STATE_DIR"];
      else process.env["JAIT_STATE_DIR"] = previousStateDir;
      await rm(stateDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
