import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { signAuthToken } from "../security/http-auth.js";
import { createServer } from "../server.js";
import { PlanService } from "../services/plans.js";
import { RepositoryService } from "../services/repositories.js";
import type { UserService } from "../services/users.js";
import { ToolRegistry } from "../tools/registry.js";

it.each(["controlled shutdown", "abrupt process crash"])("reopens a persisted interrupted real worker after %s and resumes only after the owner's decision", async (mode) => {
  const realFetch = globalThis.fetch;
  const artifacts = resolve(import.meta.dirname, "../../../../.jait/artifacts");
  await mkdir(artifacts, { recursive: true });
  const fixture = await mkdtemp(join(artifacts, "workflow-route-restart-"));
  const dbPath = join(fixture, "gateway.sqlite");
  await writeFile(join(fixture, "result.txt"), "fixture\n");
  const config = { ...loadConfig(), jwtSecret: "workflow-restart-test-secret" };
  const userService = {
    findById: (id: string) => ["owner", "outsider"].includes(id) ? { id } : undefined,
    getSettings: () => ({ chatProvider: "jait", jaitBackend: "openai", selectedModel: "fixture-model",
      apiKeys: { OPENAI_API_KEY: "fixture", OPENAI_BASE_URL: "https://fixture.example.test/v1" } }),
  } as unknown as UserService;
  let database = await openDatabase(dbPath);
  migrateDatabase(database.sqlite);
  let databaseOpen = true;
  let app: Awaited<ReturnType<typeof createServer>> | undefined;
  let child: ChildProcess | undefined;
  let childOutput = "";
  let baseUrl = "";
  const http = async ({ url, headers, method = "GET", payload }: {
    url: string; headers: Record<string, string>; method?: string; payload?: unknown;
  }) => {
    const response = await realFetch(`${baseUrl}${url}`, {
      method, headers: { ...headers, ...(payload === undefined ? {} : { "content-type": "application/json" }) },
      body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(5000),
    });
    const body = await response.text();
    return { statusCode: response.status, body, json: () => JSON.parse(body) };
  };
  try {
    let repos = new RepositoryService(database.db);
    let plans = new PlanService(database.db);
    const repo = repos.create({ userId: "owner", name: "fixture", localPath: fixture });
    const plan = plans.create({ userId: "owner", repoId: repo.id, title: "Restart fixture", tasks: [{
      id: "analyze", title: "Analyze", description: "Inspect fixture", status: "approved", resources: {},
      verification: [{ id: "file", label: "Fixture exists", check: { kind: "artifact", path: "result.txt" } }],
    }] });
    const headers = { authorization: `Bearer ${await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret)}` };
    const outsider = { authorization: `Bearer ${await signAuthToken({ id: "outsider", username: "outsider" }, config.jwtSecret)}` };
    let runId: string;
    if (mode === "abrupt process crash") {
      database.sqlite.close();
      databaseOpen = false;
      const readyPath = join(fixture, "worker-ready");
      child = spawn("bun", [resolve(import.meta.dirname, "plan-runs-crash.fixture.ts"), dbPath, plan.id, readyPath], { stdio: ["ignore", "pipe", "pipe"] });
      const capture = (chunk: Buffer) => { childOutput = (childOutput + chunk.toString()).slice(-32_000); };
      child.stdout!.on("data", capture);
      child.stderr!.on("data", capture);
      let ready = "";
      await expect.poll(async () => {
        if (child!.exitCode !== null) throw new Error(`Fixture exited early: ${childOutput}`);
        ready = await readFile(readyPath, "utf8").catch(() => "");
        return ready.length > 0;
      }, { timeout: 20_000 }).toBe(true);
      runId = ready;
      const exited = new Promise<void>((resolveExit) => child!.once("exit", () => resolveExit()));
      expect(child.kill("SIGKILL")).toBe(true);
      await exited;
      expect(child.signalCode).toBe("SIGKILL");
      child = undefined;
    } else {
      const hangingFetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
        const signal = init.signal!;
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }));
      vi.stubGlobal("fetch", hangingFetch);
      app = await createServer(config, { db: database.db, repoService: repos, planService: plans, userService, toolRegistry: new ToolRegistry() });
      baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
      const start = await http({ method: "POST", url: `/api/plans/${plan.id}/runs`, headers, payload: {} });
      expect(start.statusCode, start.body).toBe(201);
      runId = start.json().run.id;
      await expect.poll(() => hangingFetch.mock.calls.length).toBe(1);
      await expect.poll(async () => (await http({ url: `/api/plan-runs/${runId}/tasks/analyze/attempts`, headers })).json().attempts[0]?.state).toBe("running");
      const signal = hangingFetch.mock.calls[0]![1].signal!;
      await app.close();
      app = undefined;
      expect(signal.aborted).toBe(true);
      database.sqlite.close();
      databaseOpen = false;
    }
    const url = `/api/plan-runs/${runId}`;
    const attemptsUrl = `${url}/tasks/analyze/attempts`;

    database = await openDatabase(dbPath);
    databaseOpen = true;
    migrateDatabase(database.sqlite);
    repos = new RepositoryService(database.db);
    plans = new PlanService(database.db);
    const workerFetch = vi.fn(async (_url: string, init: RequestInit) => {
      const { messages } = JSON.parse(String(init.body));
      const prompt: string = messages.find((message: { role: string }) => message.role === "user").content;
      const contract = prompt.split("\n").find((line) => line.startsWith('{"taskId":'));
      const report = { ...JSON.parse(contract!), summary: "Resumed fixture completed" };
      return new Response([
        `data: ${JSON.stringify({ choices: [{ delta: { content: `[INFORM] ${JSON.stringify(report)}` } }] })}\n\n`,
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ].join(""), { headers: { "Content-Type": "text/event-stream" } });
    });
    vi.stubGlobal("fetch", workerFetch);
    app = await createServer(config, { db: database.db, repoService: repos, planService: plans, userService, toolRegistry: new ToolRegistry() });
    baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
    const recovered = await http({ url, headers });
    expect(recovered.json().run).toMatchObject({ status: "interrupted", paused: true, tasks: [{ taskId: "analyze", state: "interrupted" }] });
    expect((await http({ url, headers: outsider })).statusCode).toBe(404);
    expect((await http({ method: "POST", url: `${url}/resume`, headers, payload: {} })).statusCode).toBe(409);
    expect(workerFetch).not.toHaveBeenCalled();
    // Schema accepts the full supported decision count before looking up the run.
    const decisions = Array.from({ length: 201 }, (_, i) => ({ taskId: `task-${i}`, decision: "retry", note: "Reviewed" }));
    const boundaryUrl = "/api/plan-runs/nonexistent/resume";
    expect((await http({ method: "POST", url: boundaryUrl, headers, payload: { decisions: decisions.slice(0, 200) } })).statusCode).toBe(404);
    expect((await http({ method: "POST", url: boundaryUrl, headers, payload: { decisions } })).statusCode).toBe(400);
    const resume = await http({ method: "POST", url: `${url}/resume`, headers,
      payload: { decisions: [{ taskId: "analyze", decision: "retry", note: "Reviewed interruption" }] } });
    expect(resume.statusCode, resume.body).toBe(200);
    await expect.poll(async () => (await http({ url, headers })).json().run.status).toBe("passed");
    const attempts = (await http({ url: attemptsUrl, headers })).json().attempts;
    expect(attempts).toMatchObject([
      { attemptNo: 1, state: "interrupted", agentRef: expect.any(String) },
      { attemptNo: 2, state: "passed", agentRef: expect.any(String), result: { summary: "Resumed fixture completed" }, verification: [{ gateId: "file", passed: true }] },
    ]);
    expect(workerFetch).toHaveBeenCalledTimes(1);

    // A separate run exercises owner cancellation over the same real HTTP listener.
    const pendingFetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init.signal!;
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    vi.stubGlobal("fetch", pendingFetch);
    const cancelStart = await http({ method: "POST", url: `/api/plans/${plan.id}/runs`, headers, payload: {} });
    expect(cancelStart.statusCode, cancelStart.body).toBe(201);
    const cancelUrl = `/api/plan-runs/${cancelStart.json().run.id}`;
    await expect.poll(() => pendingFetch.mock.calls.length).toBe(1);
    expect((await http({ method: "POST", url: `${cancelUrl}/cancel`, headers: outsider, payload: {} })).statusCode).toBe(404);
    expect(pendingFetch.mock.calls[0]![1].signal!.aborted).toBe(false);
    const cancelled = await http({ method: "POST", url: `${cancelUrl}/cancel`, headers, payload: {} });
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    await expect.poll(() => pendingFetch.mock.calls[0]![1].signal!.aborted).toBe(true);
    expect((await http({ url: cancelUrl, headers })).json().run.status).toBe("cancelled");
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((resolveExit) => child!.once("exit", () => resolveExit()));
      child.kill("SIGKILL");
      await exited;
    }
    await app?.close();
    vi.unstubAllGlobals();
    if (databaseOpen) database.sqlite.close();
    await rm(fixture, { recursive: true, force: true });
  }
}, 30_000);
