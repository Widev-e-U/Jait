import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { PlanTask } from "@jait/shared";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { signAuthToken } from "../security/http-auth.js";
import { createServer } from "../server.js";
import { PlanService } from "../services/plans.js";
import { RepositoryService } from "../services/repositories.js";
import type { UserService } from "../services/users.js";
import { createFileListTool, createFilePatchTool, createFileReadTool, createFileWriteTool } from "../tools/file-tools.js";
import type { ToolContext, ToolDefinition } from "../tools/contracts.js";
import { ConsentAwareExecutor } from "../security/consent-executor.js";
import { ConsentManager } from "../security/consent-manager.js";
import type { ToolPermission } from "../security/tool-permissions.js";
import { TrustEngine } from "../security/trust-engine.js";
import { ToolRegistry } from "../tools/registry.js";
import { FileSystemSurfaceFactory } from "../surfaces/filesystem.js";
import { SurfaceRegistry } from "../surfaces/registry.js";

/**
 * Live check, not part of the normal suite. It runs one approved writing
 * workflow through the real in-process worker against a real model endpoint,
 * in a scratch repository with synthetic content only.
 *
 * Enable with JAIT_LIVE_WORKFLOW_MODEL, for example deepseek-v4.1-flash:cloud.
 * JAIT_LIVE_WORKFLOW_BASE_URL overrides the OpenAI-compatible endpoint, which
 * defaults to the local Ollama API. Cloud-tagged models send the request
 * content to their hosted service.
 */
const model = process.env["JAIT_LIVE_WORKFLOW_MODEL"];
const baseUrl = process.env["JAIT_LIVE_WORKFLOW_BASE_URL"] ?? "http://127.0.0.1:11434/v1";
const owner = "owner";
const config = { ...loadConfig(), jwtSecret: "plan-runs-live-secret" };
const artifacts = resolve(import.meta.dirname, "../../../../.jait/artifacts");
const GREETING = "hello from a live workflow check";

async function auth(userId: string) {
  const token = await signAuthToken({ id: userId, username: userId }, config.jwtSecret);
  return { authorization: `Bearer ${token}` };
}

describe.skipIf(!model)("plan run against a live model", () => {
  it("runs one approved writing workflow through the real worker and integrates its file", async () => {
    await mkdir(artifacts, { recursive: true });
    const stateDir = await mkdtemp(join(artifacts, "workflow-live-state-"));
    const repoDir = await mkdtemp(join(artifacts, "workflow-live-repo-"));
    const previousStateDir = process.env["JAIT_STATE_DIR"];
    process.env["JAIT_STATE_DIR"] = stateDir;
    const database = await openDatabase(":memory:");
    migrateDatabase(database.sqlite);
    // The real filesystem surface factory, so the file tools run the way they do in the gateway.
    const surfaces = new SurfaceRegistry();
    surfaces.register(new FileSystemSurfaceFactory());
    let app: Awaited<ReturnType<typeof createServer>> | undefined;
    try {
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repoDir });
      await writeFile(join(repoDir, "README.md"), "scratch repository for a live workflow check\n");
      execFileSync("git", ["add", "README.md"], { cwd: repoDir });
      execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-q", "-m", "base"], { cwd: repoDir });
      const mainBefore = execFileSync("git", ["rev-parse", "main"], { cwd: repoDir, encoding: "utf8" }).trim();

      const repoService = new RepositoryService(database.db);
      const planService = new PlanService(database.db);
      const repo = repoService.create({ userId: owner, name: "repo", localPath: repoDir });
      const task: PlanTask = {
        id: "hello",
        title: "Write the greeting",
        description: `Create out/hello.txt with exactly the text between these delimiters: <content>${GREETING}</content>
Do not include the delimiters or any punctuation outside them. Then reply with the JSON report only.`,
        status: "approved",
        resources: { writes: ["out"] },
        verification: [{ id: "file", label: "Greeting file exists", check: { kind: "artifact", path: "out/hello.txt" } }],
      };
      const plan = planService.create({ userId: owner, repoId: repo.id, title: "Live check", tasks: [task] });

      const toolRegistry = new ToolRegistry();
      for (const tool of [createFileReadTool(surfaces), createFileListTool(surfaces), createFileWriteTool(surfaces), createFilePatchTool(surfaces)]) {
        toolRegistry.register(tool);
      }
      const userService = {
        findById: (id: string) => (id === owner ? { id } : undefined),
        getSettings: () => ({
          chatProvider: "jait", jaitBackend: "openai", selectedModel: model,
          apiKeys: { OPENAI_API_KEY: "local", OPENAI_BASE_URL: baseUrl },
        }),
      } as unknown as UserService;
      const gateway = await createServer(config, {
        db: database.db, repoService, planService, userService, toolRegistry,
        toolExecutor: (name, input, context) => toolRegistry.execute(name, input, context),
      });
      app = gateway;
      const headers = await auth(owner);
      const start = await gateway.inject({ method: "POST", url: `/api/plans/${plan.id}/runs`, headers, payload: {} });
      expect(start.statusCode, start.body).toBe(201);
      const runId = start.json().run.id as string;
      const url = `/api/plan-runs/${runId}`;

      const terminal = /^(passed|failed|interrupted|cancelled)$/;
      await expect.poll(async () => (await gateway.inject({ url, headers })).json().run.status, { timeout: 900_000, interval: 2_000 })
        .toMatch(terminal);
      const view = (await gateway.inject({ url, headers })).json().run;
      const attempts = (await gateway.inject({ url: `${url}/tasks/${task.id}/attempts`, headers })).json().attempts;
      console.info(JSON.stringify({ model, baseUrl, status: view.status, error: view.error, tasks: view.tasks, attempts }, null, 2));

      expect(view.status, JSON.stringify({ error: view.error, tasks: view.tasks })).toBe("passed");
      expect(attempts.at(-1)).toMatchObject({ state: "passed", agentRef: expect.any(String) });

      // The change reached the integration branch, and the user's branch did not move.
      const branch = execFileSync("git", ["for-each-ref", "--format=%(refname:short)", "refs/heads/"], { cwd: repoDir, encoding: "utf8" })
        .split("\n").find((name) => name.startsWith("jait/wf/") && name.includes(runId));
      expect(branch, "integration branch for the run").toBeDefined();
      expect(execFileSync("git", ["show", `${branch}:out/hello.txt`], { cwd: repoDir, encoding: "utf8" }).trim()).toBe(GREETING);
      expect(execFileSync("git", ["rev-parse", "main"], { cwd: repoDir, encoding: "utf8" }).trim()).toBe(mainBefore);
    } finally {
      for (const surface of surfaces.listSurfaces()) await surfaces.stopSurface(surface.id, "live check finished").catch(() => {});
      await app?.close();
      database.sqlite.close();
      if (previousStateDir === undefined) delete process.env["JAIT_STATE_DIR"];
      else process.env["JAIT_STATE_DIR"] = previousStateDir;
      await rm(stateDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  }, 1_000_000);

  it("runs a dependent second task after the first and integrates both files in order", async () => {
    await mkdir(artifacts, { recursive: true });
    const stateDir = await mkdtemp(join(artifacts, "workflow-live-dep-state-"));
    const repoDir = await mkdtemp(join(artifacts, "workflow-live-dep-repo-"));
    const previousStateDir = process.env["JAIT_STATE_DIR"];
    process.env["JAIT_STATE_DIR"] = stateDir;
    const database = await openDatabase(":memory:");
    migrateDatabase(database.sqlite);
    const surfaces = new SurfaceRegistry();
    surfaces.register(new FileSystemSurfaceFactory());
    let app: Awaited<ReturnType<typeof createServer>> | undefined;
    try {
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repoDir });
      await writeFile(join(repoDir, "README.md"), "scratch repository for a live workflow check\n");
      execFileSync("git", ["add", "README.md"], { cwd: repoDir });
      execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-q", "-m", "base"], { cwd: repoDir });

      const repoService = new RepositoryService(database.db);
      const planService = new PlanService(database.db);
      const repo = repoService.create({ userId: owner, name: "repo", localPath: repoDir });
      const first: PlanTask = {
        id: "first",
        title: "Write the first file",
        description: `Create out/first.txt with exactly the text between these delimiters: <content>${GREETING}</content>
Do not include the delimiters. Then reply with the JSON report only.`,
        status: "approved",
        resources: { writes: ["out"] },
        verification: [{ id: "file", label: "First file exists", check: { kind: "artifact", path: "out/first.txt" } }],
      };
      const second: PlanTask = {
        id: "second",
        title: "Copy the first file",
        description: `Read out/first.txt, which the dependency produced, and create out/second.txt with exactly the same text.
Then reply with the JSON report only.`,
        status: "approved",
        dependsOn: ["first"],
        resources: { writes: ["out"] },
        verification: [{ id: "file", label: "Second file exists", check: { kind: "artifact", path: "out/second.txt" } }],
      };
      const plan = planService.create({ userId: owner, repoId: repo.id, title: "Live dependency check", tasks: [first, second] });

      const toolRegistry = new ToolRegistry();
      for (const tool of [createFileReadTool(surfaces), createFileListTool(surfaces), createFileWriteTool(surfaces), createFilePatchTool(surfaces)]) {
        toolRegistry.register(tool);
      }
      const userService = {
        findById: (id: string) => (id === owner ? { id } : undefined),
        getSettings: () => ({
          chatProvider: "jait", jaitBackend: "openai", selectedModel: model,
          apiKeys: { OPENAI_API_KEY: "local", OPENAI_BASE_URL: baseUrl },
        }),
      } as unknown as UserService;
      const gateway = await createServer(config, {
        db: database.db, repoService, planService, userService, toolRegistry,
        toolExecutor: (name, input, context) => toolRegistry.execute(name, input, context),
      });
      app = gateway;
      const headers = await auth(owner);
      const start = await gateway.inject({ method: "POST", url: `/api/plans/${plan.id}/runs`, headers, payload: {} });
      expect(start.statusCode, start.body).toBe(201);
      const runId = start.json().run.id as string;
      const url = `/api/plan-runs/${runId}`;

      await expect.poll(async () => (await gateway.inject({ url, headers })).json().run.status, { timeout: 900_000, interval: 2_000 })
        .toMatch(/^(passed|failed|interrupted|cancelled)$/);
      const view = (await gateway.inject({ url, headers })).json().run;
      expect(view.status, JSON.stringify({ error: view.error, tasks: view.tasks })).toBe("passed");

      const firstAttempts = (await gateway.inject({ url: `${url}/tasks/first/attempts`, headers })).json().attempts;
      const secondAttempts = (await gateway.inject({ url: `${url}/tasks/second/attempts`, headers })).json().attempts;
      expect(firstAttempts.at(-1)).toMatchObject({ state: "passed", agentRef: expect.any(String) });
      expect(secondAttempts.at(-1)).toMatchObject({ state: "passed", agentRef: expect.any(String) });
      // The dependent task only started once its dependency had finished.
      expect(new Date(secondAttempts[0].startedAt).getTime()).toBeGreaterThanOrEqual(new Date(firstAttempts.at(-1).finishedAt).getTime());

      const branch = execFileSync("git", ["for-each-ref", "--format=%(refname:short)", "refs/heads/"], { cwd: repoDir, encoding: "utf8" })
        .split("\n").find((name) => name.startsWith("jait/wf/") && name.includes(runId));
      expect(branch, "integration branch for the run").toBeDefined();
      for (const file of ["first", "second"]) {
        expect(execFileSync("git", ["show", `${branch}:out/${file}.txt`], { cwd: repoDir, encoding: "utf8" }).trim()).toBe(GREETING);
      }
    } finally {
      for (const surface of surfaces.listSurfaces()) await surfaces.stopSurface(surface.id, "live check finished").catch(() => {});
      await app?.close();
      database.sqlite.close();
      if (previousStateDir === undefined) delete process.env["JAIT_STATE_DIR"];
      else process.env["JAIT_STATE_DIR"] = previousStateDir;
      await rm(stateDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  }, 1_000_000);

  it("halts a real in-flight model request, leaves its attempt interrupted, and integrates nothing", async () => {
    await mkdir(artifacts, { recursive: true });
    const stateDir = await mkdtemp(join(artifacts, "workflow-live-halt-state-"));
    const repoDir = await mkdtemp(join(artifacts, "workflow-live-halt-repo-"));
    const previousStateDir = process.env["JAIT_STATE_DIR"];
    process.env["JAIT_STATE_DIR"] = stateDir;
    const database = await openDatabase(":memory:");
    migrateDatabase(database.sqlite);
    const surfaces = new SurfaceRegistry();
    surfaces.register(new FileSystemSurfaceFactory());
    // Record each model request with its abort signal, so the check can see whether the halt reached the request.
    const realFetch = globalThis.fetch;
    const modelRequests: Array<AbortSignal | null | undefined> = [];
    globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(input).startsWith(baseUrl)) modelRequests.push(init?.signal);
      return realFetch(input, init);
    }) as typeof fetch;
    let app: Awaited<ReturnType<typeof createServer>> | undefined;
    try {
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repoDir });
      await writeFile(join(repoDir, "README.md"), "scratch repository for a live halt check\n");
      execFileSync("git", ["add", "README.md"], { cwd: repoDir });
      execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-q", "-m", "base"], { cwd: repoDir });
      const mainBefore = execFileSync("git", ["rev-parse", "main"], { cwd: repoDir, encoding: "utf8" }).trim();

      const repoService = new RepositoryService(database.db);
      const planService = new PlanService(database.db);
      const repo = repoService.create({ userId: owner, name: "repo", localPath: repoDir });
      const task: PlanTask = {
        id: "hello",
        title: "Write the greeting",
        description: `Create the file out/hello.txt containing exactly this line: ${GREETING}. Then reply with the JSON report only.`,
        status: "approved",
        resources: { writes: ["out"] },
        verification: [{ id: "file", label: "Greeting file exists", check: { kind: "artifact", path: "out/hello.txt" } }],
      };
      const plan = planService.create({ userId: owner, repoId: repo.id, title: "Live halt check", tasks: [task] });

      const toolRegistry = new ToolRegistry();
      for (const tool of [createFileReadTool(surfaces), createFileListTool(surfaces), createFileWriteTool(surfaces), createFilePatchTool(surfaces)]) {
        toolRegistry.register(tool);
      }
      const userService = {
        findById: (id: string) => (id === owner ? { id } : undefined),
        getSettings: () => ({
          chatProvider: "jait", jaitBackend: "openai", selectedModel: model,
          apiKeys: { OPENAI_API_KEY: "local", OPENAI_BASE_URL: baseUrl },
        }),
      } as unknown as UserService;
      const gateway = await createServer(config, {
        db: database.db, repoService, planService, userService, toolRegistry,
        toolExecutor: (name, input, context) => toolRegistry.execute(name, input, context),
      });
      app = gateway;
      const headers = await auth(owner);
      const start = await gateway.inject({ method: "POST", url: `/api/plans/${plan.id}/runs`, headers, payload: {} });
      expect(start.statusCode, start.body).toBe(201);
      const runId = start.json().run.id as string;
      const url = `/api/plan-runs/${runId}`;
      const attemptsUrl = `${url}/tasks/${task.id}/attempts`;

      // Halt only once the model request is in flight, so the halt has to abort a real call.
      await expect.poll(() => modelRequests.length, { timeout: 120_000, interval: 200 }).toBeGreaterThan(0);
      const halt = await gateway.inject({ method: "POST", url: "/api/agent-control/halt", headers, payload: { reason: "live halt check" } });
      expect(halt.statusCode, halt.body).toBe(200);

      await expect.poll(async () => (await gateway.inject({ url: attemptsUrl, headers })).json().attempts[0]?.state, { timeout: 120_000, interval: 500 })
        .toBe("interrupted");
      const view = (await gateway.inject({ url, headers })).json().run;
      expect(view, JSON.stringify(view)).toMatchObject({ status: "interrupted", paused: true });
      const attempts = (await gateway.inject({ url: attemptsUrl, headers })).json().attempts;
      expect(attempts).toMatchObject([{ attemptNo: 1, state: "interrupted", finishedAt: expect.any(String) }]);
      // The halt reached the model request itself, not only the run's bookkeeping.
      expect(modelRequests.some((signal) => signal?.aborted === true)).toBe(true);

      // Nothing was integrated: the run's branch, if one exists, has no greeting file, and the user's branch did not move.
      const branch = execFileSync("git", ["for-each-ref", "--format=%(refname:short)", "refs/heads/"], { cwd: repoDir, encoding: "utf8" })
        .split("\n").find((name) => name.startsWith("jait/wf/") && name.includes(runId));
      if (branch) {
        expect(execFileSync("git", ["ls-tree", "-r", "--name-only", branch], { cwd: repoDir, encoding: "utf8" })).not.toContain("out/hello.txt");
      }
      expect(execFileSync("git", ["rev-parse", "main"], { cwd: repoDir, encoding: "utf8" }).trim()).toBe(mainBefore);
    } finally {
      globalThis.fetch = realFetch;
      for (const surface of surfaces.listSurfaces()) await surfaces.stopSurface(surface.id, "live halt check finished").catch(() => {});
      await app?.close();
      database.sqlite.close();
      if (previousStateDir === undefined) delete process.env["JAIT_STATE_DIR"];
      else process.env["JAIT_STATE_DIR"] = previousStateDir;
      await rm(stateDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  }, 600_000);

  it("holds a real writer's command gate for owner consent, then advances once approved", async () => {
    await mkdir(artifacts, { recursive: true });
    const stateDir = await mkdtemp(join(artifacts, "workflow-live-gate-state-"));
    const repoDir = await mkdtemp(join(artifacts, "workflow-live-gate-repo-"));
    const previousStateDir = process.env["JAIT_STATE_DIR"];
    process.env["JAIT_STATE_DIR"] = stateDir;
    const database = await openDatabase(":memory:");
    migrateDatabase(database.sqlite);
    const surfaces = new SurfaceRegistry();
    surfaces.register(new FileSystemSurfaceFactory());
    let app: Awaited<ReturnType<typeof createServer>> | undefined;
    try {
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repoDir });
      await writeFile(join(repoDir, "README.md"), "scratch repository for a live gate check\n");
      execFileSync("git", ["add", "README.md"], { cwd: repoDir });
      execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-q", "-m", "base"], { cwd: repoDir });

      const repoService = new RepositoryService(database.db);
      const planService = new PlanService(database.db);
      const repo = repoService.create({ userId: owner, name: "repo", localPath: repoDir });
      const task: PlanTask = {
        id: "hello",
        title: "Write the greeting",
        description: `Create out/hello.txt with exactly the text between these delimiters: <content>${GREETING}</content>
Do not include the delimiters or any punctuation outside them. Then reply with the JSON report only.`,
        status: "approved",
        resources: { writes: ["out"] },
        verification: [{ id: "nonempty", label: "Greeting is non-empty", check: { kind: "command", command: "test -s out/hello.txt" } }],
      };
      const plan = planService.create({ userId: owner, repoId: repo.id, title: "Live gate check", tasks: [task] });

      const toolRegistry = new ToolRegistry();
      for (const tool of [createFileReadTool(surfaces), createFileListTool(surfaces), createFileWriteTool(surfaces), createFilePatchTool(surfaces)]) {
        toolRegistry.register(tool);
      }
      const ran: string[] = [];
      toolRegistry.register({
        name: "terminal.run",
        description: "Run a command in the terminal",
        parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
        execute: async (input: unknown, context: ToolContext) => {
          const { command } = input as { command: string };
          ran.push(command);
          try {
            execFileSync("sh", ["-c", command], { cwd: context.projectRoot, stdio: "pipe" });
            return { ok: true, message: "exit 0" };
          } catch (error) {
            return { ok: false, message: `exit ${(error as { status?: number }).status ?? "error"}` };
          }
        },
      } as unknown as ToolDefinition);
      const consentManager = new ConsentManager({ defaultTimeoutMs: 600_000 });
      // Unlisted tools would themselves wait for consent, so the file tools are explicitly open; only the gate command is held.
      const permissions = new Map<string, ToolPermission>([
        ...["file.read", "file.list", "file.write", "file.patch"].map((name) => [name, {
          toolName: name, consentLevel: "none", risk: "low", description: name, knownTool: true, source: "profile",
        } as unknown as ToolPermission] as const),
        ["terminal.run", {
          toolName: "terminal.run", consentLevel: "always", risk: "high", description: "Run a terminal command", knownTool: true, source: "profile",
        } as unknown as ToolPermission],
      ]);
      const consentExecutor = new ConsentAwareExecutor({
        toolRegistry, consentManager, trustEngine: new TrustEngine(), permissions, sessionApprovals: new Set<string>(),
      });
      const userService = {
        findById: (id: string) => (id === owner ? { id } : undefined),
        getSettings: () => ({
          chatProvider: "jait", jaitBackend: "openai", selectedModel: model,
          apiKeys: { OPENAI_API_KEY: "local", OPENAI_BASE_URL: baseUrl },
        }),
      } as unknown as UserService;
      const gateway = await createServer(config, {
        db: database.db, repoService, planService, userService, toolRegistry,
        toolExecutor: (name, input, context, options) => consentExecutor.execute(name, input, context, options),
      });
      app = gateway;
      const headers = await auth(owner);
      const start = await gateway.inject({ method: "POST", url: `/api/plans/${plan.id}/runs`, headers, payload: {} });
      expect(start.statusCode, start.body).toBe(201);
      const runId = start.json().run.id as string;
      const url = `/api/plan-runs/${runId}`;

      // The writer finishes for real, then the gate must wait for the owner's decision.
      await expect.poll(() => consentManager.listPending(`workflow:${runId}`).length, { timeout: 900_000, interval: 1_000 }).toBe(1);
      const [request] = consentManager.listPending(`workflow:${runId}`);
      expect(request?.toolName).toBe("terminal.run");
      expect(ran, "no gate command runs before consent").toEqual([]);
      expect((await gateway.inject({ url, headers })).json().run.status).not.toMatch(/^(passed|failed)$/);

      consentManager.approve(request!.id, "live check owner approval");
      await expect.poll(async () => (await gateway.inject({ url, headers })).json().run.status, { timeout: 120_000, interval: 1_000 })
        .toMatch(/^(passed|failed|interrupted|cancelled)$/);
      const view = (await gateway.inject({ url, headers })).json().run;
      console.info(JSON.stringify({ status: view.status, error: view.error, ran }, null, 2));
      expect(view.status, JSON.stringify({ error: view.error, tasks: view.tasks })).toBe("passed");
      expect(ran).toEqual(["test -s out/hello.txt"]);
    } finally {
      for (const surface of surfaces.listSurfaces()) await surfaces.stopSurface(surface.id, "live gate check finished").catch(() => {});
      await app?.close();
      database.sqlite.close();
      if (previousStateDir === undefined) delete process.env["JAIT_STATE_DIR"];
      else process.env["JAIT_STATE_DIR"] = previousStateDir;
      await rm(stateDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  }, 1_100_000);
});
