/**
 * ACP coding-agent workers: the worker itself, the router that picks it, and plan
 * runs over real git worktrees with a scripted ACP provider. No model is called.
 */
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { TaskWorker } from "@jait/shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type JaitDB, migrateDatabase, openDatabase } from "../../db/connection.js";
import type { SqliteDatabase } from "../../db/sqlite-shim.js";
import type { CliProviderAdapter, ProviderEvent, ProviderSession, StartSessionOptions } from "../../providers/contracts.js";
import { ProviderRegistry } from "../../providers/registry.js";
import { ConsentManager } from "../../security/consent-manager.js";
import { PlanService } from "../plans.js";
import type { RepositoryService } from "../repositories.js";
import { createAcpWorkflowWorker } from "./acp-worker.js";
import { createWorkflowVerifier, type ToolExecutorFn } from "./command-verifier.js";
import { type SubAgentRunner, type SubAgentRunRequest, SubAgentTaskExecutor, unboundSubAgentRunner } from "./executor.js";
import { OrchestrationService, workflowSessionId } from "./orchestrator.js";
import { routeWorkers } from "./worker-router.js";
import { integrationBranchName, WorkflowWorkspaces } from "./workspace.js";

const OWNER = "owner-1";
const REPO_ID = "repo-1";
const CONFIG = { host: "127.0.0.1", port: 8000 };
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
const ACP_WORKER: TaskWorker = { kind: "acp", providerId: "claude-code" };

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}

async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function writeInSync(root: string, relative: string, content: string): void {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}

interface FakeOptions {
  modes?: Array<"full-access" | "supervised">;
  /** "hang" never finishes the turn; "fail" throws out of it. */
  behavior?: "finish" | "hang" | "fail";
  /** Asks for one tool approval before the turn can finish. */
  approval?: { tool: string; args: unknown };
  /** Runs once the agent may act: when no approval was asked, or when the owner allowed it. */
  onAllowed?: (workingDirectory: string) => void;
  /** The agent's final answer, built from the prompt it was sent. */
  reply?: (prompt: string) => string;
}

/** A CliProviderAdapter double that streams events, asks for approvals and records what it was told. */
class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info: CliProviderAdapter["info"];
  readonly emitter = new EventEmitter();
  readonly started: StartSessionOptions[] = [];
  readonly stopped: string[] = [];
  readonly answers: Array<{ requestId: string; approved: boolean }> = [];
  private resolveApproval: ((approved: boolean) => void) | undefined;

  constructor(private readonly options: FakeOptions = {}) {
    this.info = {
      id: "claude-code",
      name: "Claude Code",
      description: "",
      available: true,
      modes: options.modes ?? ["full-access", "supervised"],
      auth: { login: false, logout: false, deviceCode: false },
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.started.push(options);
    return { id: `sess-${this.started.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    if (this.options.behavior === "hang") await new Promise<void>(() => {});
    if (this.options.behavior === "fail") throw new Error("transport closed");
    const workingDirectory = this.started[this.started.length - 1]?.workingDirectory ?? "";
    if (this.options.approval) {
      const approval = this.options.approval;
      const approved = await new Promise<boolean>((resolve) => {
        this.resolveApproval = resolve;
        this.emitter.emit("event", {
          type: "tool.approval-required",
          sessionId,
          tool: approval.tool,
          args: approval.args,
          requestId: "req-1",
        } satisfies ProviderEvent);
      });
      if (approved) this.options.onAllowed?.(workingDirectory);
    } else {
      this.options.onAllowed?.(workingDirectory);
    }
    const reply = this.options.reply?.(message) ?? '{"status":"completed"}';
    this.emitter.emit("event", { type: "token", sessionId, content: reply } satisfies ProviderEvent);
  }

  async respondToApproval(_sessionId: string, requestId: string, approved: boolean): Promise<void> {
    this.answers.push({ requestId, approved });
    this.resolveApproval?.(approved);
  }

  async interruptTurn(): Promise<void> {}

  async stopSession(sessionId: string): Promise<void> {
    this.stopped.push(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}

function requestFor(overrides: Partial<SubAgentRunRequest> = {}): SubAgentRunRequest {
  return {
    userId: OWNER,
    runId: "run-1",
    taskId: "guide",
    attemptId: "attempt-1",
    prompt: "Write the guide.",
    claims: { reads: [], writes: ["docs/guide.md"] },
    worker: ACP_WORKER,
    workspace: { path: "/worktrees/run-1/guide", mode: "write" },
    timeoutMs: 5_000,
    signal: new AbortController().signal,
    ...overrides,
  };
}

function setupWorker(options: FakeOptions = {}) {
  const provider = new FakeAcpProvider(options);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
  const worker = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
  return { provider, consentManager, worker };
}

const APPROVAL = { tool: "Edit file", args: { path: "docs/guide.md" } };

describe("ACP workflow worker", () => {
  it("runs one supervised turn in the task worktree without Jait's own tools, and returns the answer", async () => {
    const { provider, worker } = setupWorker({ reply: () => '{"status":"completed"}' });
    const refs: string[] = [];
    const result = await worker.run(requestFor({ recordAgentRef: (ref) => refs.push(ref) }));

    expect(result).toEqual({ text: '{"status":"completed"}' });
    expect(provider.started).toHaveLength(1);
    expect(provider.started[0]).toMatchObject({
      workingDirectory: "/worktrees/run-1/guide",
      mode: "supervised",
      mcpServers: [],
    });
    expect(refs).toEqual(["acp:claude-code:attempt-1"]);
    expect(provider.stopped).toEqual(["sess-1"]);
  });

  it("never starts a provider that cannot run supervised", async () => {
    const { provider, worker } = setupWorker({ modes: ["full-access"] });
    await expect(worker.run(requestFor())).rejects.toThrow("cannot run supervised");
    expect(provider.started).toEqual([]);
  });

  it("needs an isolated write worktree for its task", async () => {
    const { provider, worker } = setupWorker();
    await expect(worker.run(requestFor({ workspace: null }))).rejects.toThrow("isolated write worktree");
    await expect(worker.run(requestFor({ workspace: { path: "/worktrees/run-1/guide", mode: "read" } })))
      .rejects.toThrow("isolated write worktree");
    expect(provider.started).toEqual([]);
  });

  it("treats a turn that never finishes as an unknown outcome and stops the session", async () => {
    const { provider, worker } = setupWorker({ behavior: "hang" });
    await expect(worker.run(requestFor({ timeoutMs: 20 }))).rejects.toThrow("did not finish its turn");
    expect(provider.stopped).toEqual(["sess-1"]);
  });

  it("treats a turn that fails as an unknown outcome", async () => {
    const { worker } = setupWorker({ behavior: "fail" });
    await expect(worker.run(requestFor())).rejects.toThrow("did not finish its turn");
  });

  it("asks the owner about each tool approval on the workflow session and passes the answer back", async () => {
    const { provider, worker, consentManager } = setupWorker({ approval: APPROVAL });
    const run = worker.run(requestFor());
    await until(() => consentManager.listPending(workflowSessionId("run-1")).length === 1);

    const [pending] = consentManager.listPending(workflowSessionId("run-1"));
    if (!pending) throw new Error("no approval was requested");
    expect(pending).toMatchObject({ toolName: "acp.claude-code", risk: "high", sessionId: workflowSessionId("run-1") });
    expect(pending.summary).toContain("Edit file");
    expect(pending.preview).toEqual({ tool: "Edit file", args: '{"path":"docs/guide.md"}' });

    consentManager.approve(pending.id);
    await expect(run).resolves.toEqual({ text: '{"status":"completed"}' });
    expect(provider.answers).toEqual([{ requestId: "req-1", approved: true }]);
  });

  it("passes a refused approval back to the agent, which then has to answer without the change", async () => {
    const { provider, worker, consentManager } = setupWorker({
      approval: APPROVAL,
      reply: () => '{"status":"blocked","error":"the owner refused the write"}',
    });
    const run = worker.run(requestFor());
    await until(() => consentManager.listPending(workflowSessionId("run-1")).length === 1);

    const [pending] = consentManager.listPending(workflowSessionId("run-1"));
    if (!pending) throw new Error("no approval was requested");
    consentManager.reject(pending.id);
    await expect(run).resolves.toEqual({ text: '{"status":"blocked","error":"the owner refused the write"}' });
    expect(provider.answers).toEqual([{ requestId: "req-1", approved: false }]);
  });

  it("denies a pending approval at once when the attempt is stopped", async () => {
    const controller = new AbortController();
    const { provider, worker, consentManager } = setupWorker({ approval: APPROVAL });
    const run = worker.run(requestFor({ signal: controller.signal }));
    await until(() => consentManager.listPending(workflowSessionId("run-1")).length === 1);

    controller.abort();
    await expect(run).rejects.toThrow();
    expect(consentManager.listPending(workflowSessionId("run-1"))).toEqual([]);
    await until(() => provider.answers.length === 1);
    expect(provider.answers).toEqual([{ requestId: "req-1", approved: false }]);
  });
});

describe("worker router", () => {
  it("sends each attempt to the runner for its worker kind", async () => {
    const jait = { run: vi.fn(async () => ({ text: "in-process" })) };
    const acp = { run: vi.fn(async () => ({ text: "acp" })) };
    const router = routeWorkers({ jait, acp });

    await expect(router.run(requestFor({ worker: { kind: "jait" } }))).resolves.toEqual({ text: "in-process" });
    await expect(router.run(requestFor())).resolves.toEqual({ text: "acp" });
    expect(jait.run).toHaveBeenCalledTimes(1);
    expect(acp.run).toHaveBeenCalledTimes(1);
  });

  it("fails ACP attempts closed when no ACP runner is bound", async () => {
    const router = routeWorkers({ jait: unboundSubAgentRunner });
    await expect(router.run(requestFor())).rejects.toThrow("ACP workers are not bound");
  });
});

// ── Plan runs over real worktrees ──────────────────────────────────────

function reportJson(taskId: string, attemptId: string, changedFiles: string[]): string {
  return JSON.stringify({ taskId, attemptId, status: "completed", summary: `${taskId} done`, changedFiles, artifacts: [], followUps: [] });
}

/** Builds the report the agent would send, from the ids in the prompt it was given. */
function reportFromPrompt(changedFiles: string[]): (prompt: string) => string {
  return (prompt) => reportJson(
    /"taskId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    /"attemptId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    changedFiles,
  );
}

function planTask(input: { id: string; writes: string[]; worker?: TaskWorker; maxAttempts?: number }) {
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: [] as string[],
    resources: { writes: input.writes },
    ...(input.worker ? { worker: input.worker } : {}),
    verification: [{ id: "output", label: `${input.writes[0]} exists`, check: { kind: "artifact" as const, path: input.writes[0] ?? "" } }],
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}

describe("ACP workers in a plan run", () => {
  let base: string;
  let repo: string;
  let sqlite: SqliteDatabase;
  let db: JaitDB;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "jait-acp-run-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeFile(join(repo, "README.md"), "project\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
  });

  afterEach(async () => {
    sqlite.close();
    await rm(base, { recursive: true, force: true });
  });

  const repositories = {
    getById: (id: string) => (id === REPO_ID ? { id, userId: OWNER, localPath: repo, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;

  /** No command gates appear in these plans, so no command is ever run. */
  const noCommands: ToolExecutorFn = async () => ({ ok: false, message: "no command gates in this plan" });

  function serviceFor(
    provider: FakeAcpProvider,
    consentManager: ConsentManager,
    options: { jait?: SubAgentRunner; perProviderMaxWorkers?: number } = {},
  ) {
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const acp = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
    const workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
    const service = new OrchestrationService({
      db,
      executor: new SubAgentTaskExecutor(routeWorkers({ jait: options.jait ?? unboundSubAgentRunner, acp })),
      verifier: createWorkflowVerifier({ repositories, toolExecutor: noCommands }),
      workspaces,
      isHalted: () => false,
      perProviderMaxWorkers: options.perProviderMaxWorkers,
      listPendingApprovals: (sessionId) => consentManager.listPending(sessionId).map((request) => ({
        id: request.id,
        toolName: request.toolName,
        summary: request.summary,
        createdAt: request.createdAt,
      })),
    });
    return { service, workspaces };
  }

  function createPlan(tasks: ReturnType<typeof planTask>[]): string {
    return new PlanService(db).create({ repoId: REPO_ID, userId: OWNER, title: "Guide plan", tasks }).id;
  }

  it("runs the agent in its worktree after the owner approves, then integrates the change", async () => {
    const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
    const provider = new FakeAcpProvider({
      approval: { tool: "Write docs/guide.md", args: { path: "docs/guide.md" } },
      onAllowed: (cwd) => writeInSync(cwd, "docs/guide.md", "guide\n"),
      reply: reportFromPrompt(["docs/guide.md"]),
    });
    const { service, workspaces } = serviceFor(provider, consentManager);
    const planId = createPlan([planTask({ id: "guide", writes: ["docs/guide.md"], worker: ACP_WORKER, maxAttempts: 1 })]);

    const run = service.createRun(OWNER, { planId, maxWorkers: 1 });
    await until(() => consentManager.listPending(workflowSessionId(run.id)).length === 1);
    // The run view shows the approval the worker waits on, in the run's worker session.
    expect(service.getRun(OWNER, run.id).pendingApprovals).toHaveLength(1);
    const [pending] = consentManager.listPending(workflowSessionId(run.id));
    if (!pending) throw new Error("no approval was requested");
    consentManager.approve(pending.id);
    await service.settle();

    const final = service.getRun(OWNER, run.id);
    expect(final.status).toBe("passed");
    expect(final.tasks[0]).toMatchObject({ taskId: "guide", state: "passed", worktreeRef: workspaces.taskPath(run.id, "guide") });
    // The worker's identity is recorded on the attempt.
    expect(JSON.stringify(service.getTaskAttempts(OWNER, run.id, "guide"))).toContain("acp:claude-code:");
    // The agent worked in its own worktree, in supervised mode.
    expect(provider.started[0]).toMatchObject({ workingDirectory: workspaces.taskPath(run.id, "guide"), mode: "supervised" });
    expect(provider.answers).toEqual([{ requestId: "req-1", approved: true }]);
    // The change is integrated on the run's branch, and the user's checkout is untouched.
    expect(git(repo, "show", `${integrationBranchName(run.id)}:docs/guide.md`)).toBe("guide");
    expect(existsSync(join(repo, "docs/guide.md"))).toBe(false);
  });

  it("leaves nothing to integrate when the owner refuses the write, so the gate fails the task", async () => {
    const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
    const provider = new FakeAcpProvider({
      approval: { tool: "Write docs/guide.md", args: { path: "docs/guide.md" } },
      onAllowed: (cwd) => writeInSync(cwd, "docs/guide.md", "guide\n"),
      // The agent claims it changed the file, but the owner refused, so the gate must catch it.
      reply: reportFromPrompt(["docs/guide.md"]),
    });
    const { service } = serviceFor(provider, consentManager);
    const planId = createPlan([planTask({ id: "guide", writes: ["docs/guide.md"], worker: ACP_WORKER, maxAttempts: 1 })]);

    const run = service.createRun(OWNER, { planId, maxWorkers: 1 });
    await until(() => consentManager.listPending(workflowSessionId(run.id)).length === 1);
    const [pending] = consentManager.listPending(workflowSessionId(run.id));
    if (!pending) throw new Error("no approval was requested");
    consentManager.reject(pending.id);
    await service.settle();

    const final = service.getRun(OWNER, run.id);
    expect(final.status).toBe("failed");
    expect(final.tasks[0]?.state).toBe("failed");
    expect(provider.answers).toEqual([{ requestId: "req-1", approved: false }]);
    expect(final.tasks[0]?.verification?.find((outcome) => outcome.gateId === "output")?.passed).toBe(false);
  });

  it("does not let a coding agent take the in-process worker's provider slot", async () => {
    const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
    const provider = new FakeAcpProvider({
      approval: { tool: "Write docs/b.md", args: { path: "docs/b.md" } },
      onAllowed: (cwd) => writeInSync(cwd, "docs/b.md", "b\n"),
      reply: reportFromPrompt(["docs/b.md"]),
    });
    const jait: SubAgentRunner = {
      async run(request) {
        if (!request.workspace) throw new Error("the in-process test worker needs a worktree");
        writeInSync(request.workspace.path, "docs/a.md", "a\n");
        return { text: reportJson(request.taskId, request.attemptId, ["docs/a.md"]) };
      },
    };
    // One slot per provider: in-process and ACP each get their own, so both can run at once.
    const { service } = serviceFor(provider, consentManager, { jait, perProviderMaxWorkers: 1 });
    const planId = createPlan([
      planTask({ id: "A", writes: ["docs/a.md"], maxAttempts: 1 }),
      planTask({ id: "B", writes: ["docs/b.md"], worker: ACP_WORKER, maxAttempts: 1 }),
    ]);

    const run = service.createRun(OWNER, { planId, maxWorkers: 2 });
    // A finishes while B still waits for its approval, so the coding agent did not hold A's slot.
    await until(() => service.getRun(OWNER, run.id).tasks.find((task) => task.taskId === "A")?.state === "passed");
    expect(service.getRun(OWNER, run.id).tasks.find((task) => task.taskId === "B")?.state).toBe("running");
    const [pending] = consentManager.listPending(workflowSessionId(run.id));
    if (!pending) throw new Error("no approval was requested");
    consentManager.approve(pending.id);
    await service.settle();

    expect(service.getRun(OWNER, run.id).status).toBe("passed");
  });
});
