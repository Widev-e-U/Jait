/**
 * End-to-end plan runs over real git worktrees. The agent is a scripted executor
 * that writes files into its workspace, and command gates run through a stand-in
 * for the consent-aware executor (the real consent path has its own tests). No
 * model is called.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { VerificationGate } from "@jait/shared/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type JaitDB, migrateDatabase, openDatabase } from "../../db/connection.js";
import type { SqliteDatabase } from "../../db/sqlite-shim.js";
import type { ToolContext } from "../../tools/contracts.js";
import { PlanService } from "../plans.js";
import type { RepositoryService } from "../repositories.js";
import { createWorkflowVerifier, type ToolExecutorFn } from "./command-verifier.js";
import { inertWorkspaces } from "./inert-workspaces.js";
import {
  OrchestrationNotFoundError,
  OrchestrationService,
  OrchestrationValidationError,
  type TaskExecutionInput,
  type TaskExecutor,
} from "./orchestrator.js";
import { integrationBranchName, WorkflowWorkspaces } from "./workspace.js";

const OWNER = "owner-1";
const OTHER = "owner-2";
const REPO_ID = "repo-1";
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}

async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}

async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function artifactGate(id: string, path: string): VerificationGate {
  return { id, label: `${path} exists`, check: { kind: "artifact", path } };
}

function commandGate(id: string, command: string): VerificationGate {
  return { id, label: command, check: { kind: "command", command } };
}

interface PlanTaskInput {
  id: string;
  dependsOn?: string[];
  reads?: string[];
  writes?: string[];
  verification: VerificationGate[];
  maxAttempts?: number;
}

/** A human-approved plan task. Resources are declared only where given. */
function approvedTask(input: PlanTaskInput) {
  const resources: { reads?: string[]; writes?: string[] } = {};
  if (input.reads) resources.reads = input.reads;
  if (input.writes) resources.writes = input.writes;
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: input.dependsOn ?? [],
    resources,
    verification: input.verification,
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}

function reportFor(input: TaskExecutionInput, changedFiles: string[] = []) {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles,
    artifacts: [],
    followUps: [],
  };
}

interface Recorded {
  command: string;
  projectRoot: string;
  requestedBy: string;
}

describe("plan runs over real worktrees", () => {
  let base: string;
  let repo: string;
  let sqlite: SqliteDatabase;
  let db: JaitDB;
  let commands: Recorded[];

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "jait-run-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "project\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    commands = [];
  });

  afterEach(async () => {
    sqlite.close();
    await rm(base, { recursive: true, force: true });
  });

  const repositories = {
    getById: (id: string) => (id === REPO_ID ? { id, userId: OWNER, localPath: repo, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;

  /** Stand-in for the consent-aware terminal path: runs the command in the given project root. */
  const shellExecutor: ToolExecutorFn = async (_name, toolInput, context: ToolContext) => {
    const { command } = toolInput as { command: string };
    commands.push({ command, projectRoot: context.projectRoot, requestedBy: context.requestedBy });
    try {
      execFileSync("sh", ["-c", command], { cwd: context.projectRoot, stdio: "pipe" });
      return { ok: true, message: "exit 0" };
    } catch (error) {
      return { ok: false, message: `exit ${(error as { status?: number }).status ?? "error"}` };
    }
  };

  function makeService(
    executor: TaskExecutor,
    options: { halted?: Set<string>; workspaces?: WorkflowWorkspaces } = {},
  ): { service: OrchestrationService; workspaces: WorkflowWorkspaces } {
    const workspaces = options.workspaces ?? new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
    const service = new OrchestrationService({
      db,
      executor,
      verifier: createWorkflowVerifier({ repositories, toolExecutor: shellExecutor }),
      workspaces,
      isHalted: (userId) => options.halted?.has(userId) ?? false,
    });
    return { service, workspaces };
  }

  function createPlan(tasks: ReturnType<typeof approvedTask>[], repoId = REPO_ID): string {
    const plans = new PlanService(db);
    const plan = plans.create({ repoId, userId: OWNER, title: "Feature plan", tasks });
    return plan.id;
  }

  it("runs analysis, two parallel writers, and a verified join, then integrates everything", async () => {
    const planId = createPlan([
      approvedTask({ id: "A", reads: ["."], verification: [artifactGate("readme", "README.md")] }),
      approvedTask({
        id: "B",
        dependsOn: ["A"],
        writes: ["docs/guide.md"],
        verification: [artifactGate("guide", "docs/guide.md"), commandGate("guide-check", "test -s docs/guide.md")],
      }),
      approvedTask({ id: "C", dependsOn: ["A"], writes: ["docs/notes.md"], verification: [artifactGate("notes", "docs/notes.md")] }),
      approvedTask({
        id: "D",
        dependsOn: ["B", "C"],
        writes: ["docs/summary.md"],
        verification: [artifactGate("summary", "docs/summary.md"), artifactGate("joined", "docs/notes.md")],
      }),
    ]);

    let running = 0;
    let maxRunning = 0;
    const events: string[] = [];
    const executor: TaskExecutor = {
      async execute(input) {
        events.push(`start:${input.taskId}`);
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        try {
          if (input.taskId === "B" || input.taskId === "C") {
            // Both writers must be active at once, or the test fails: parallel start is what is being verified.
            await until(() => maxRunning >= 2);
            const file = input.taskId === "B" ? "docs/guide.md" : "docs/notes.md";
            await writeIn(input.workspace!.path, file, `${input.taskId}\n`);
            return reportFor(input, [file]);
          }
          if (input.taskId === "D") {
            // The join sees both predecessors' files because its workspace starts from the integrated head.
            expect(existsSync(join(input.workspace!.path, "docs/guide.md"))).toBe(true);
            expect(existsSync(join(input.workspace!.path, "docs/notes.md"))).toBe(true);
            await writeIn(input.workspace!.path, "docs/summary.md", "summary\n");
            return reportFor(input, ["docs/summary.md"]);
          }
          return reportFor(input);
        } finally {
          running -= 1;
          events.push(`end:${input.taskId}`);
        }
      },
    };

    const { service, workspaces } = makeService(executor);
    const run = service.createRun(OWNER, { planId, maxWorkers: 2 });
    await service.settle();

    const final = service.getRun(OWNER, run.id);
    expect(final.status).toBe("passed");
    expect(final.tasks.map((task) => [task.taskId, task.state])).toEqual([
      ["A", "passed"],
      ["B", "passed"],
      ["C", "passed"],
      ["D", "passed"],
    ]);
    expect(maxRunning).toBe(2);
    // Dependencies gate starts: A ends before B and C start, and D starts only after B and C end.
    expect(events.indexOf("end:A")).toBeLessThan(events.indexOf("start:B"));
    expect(events.indexOf("end:A")).toBeLessThan(events.indexOf("start:C"));
    expect(events.indexOf("end:B")).toBeLessThan(events.indexOf("start:D"));
    expect(events.indexOf("end:C")).toBeLessThan(events.indexOf("start:D"));

    // Verification evidence: scope, plan gates and integration are all recorded and passed.
    const guide = final.tasks.find((task) => task.taskId === "B");
    expect(guide?.verification?.map((outcome) => outcome.gateId)).toEqual([
      "system:scope",
      "guide",
      "guide-check",
      "system:integration",
    ]);
    expect(guide?.verification?.every((outcome) => outcome.passed)).toBe(true);
    expect(guide?.worktreeRef).toBe(workspaces.taskPath(run.id, "B"));

    // The command gate ran in B's worktree, for the workflow, with the plan's command.
    expect(commands).toContainEqual({
      command: "test -s docs/guide.md",
      projectRoot: workspaces.taskPath(run.id, "B"),
      requestedBy: "workflow",
    });

    // Everything is integrated on the integration branch. The user's branch is untouched.
    const integration = workspaces.integrationPath(run.id);
    expect(git(integration, "rev-parse", "--abbrev-ref", "HEAD")).toBe(integrationBranchName(run.id));
    for (const file of ["README.md", "docs/guide.md", "docs/notes.md", "docs/summary.md"]) {
      expect(existsSync(join(integration, file))).toBe(true);
    }
    expect(git(repo, "branch", "--show-current")).toBe("main");
    expect(git(repo, "rev-list", "--count", "main")).toBe("1");
    expect(existsSync(join(repo, "docs"))).toBe(false);
  });

  it("fails a writer that changes files outside its declared writes and blocks its dependents", async () => {
    const planId = createPlan([
      approvedTask({ id: "A", reads: ["."], verification: [artifactGate("readme", "README.md")] }),
      approvedTask({
        id: "W",
        dependsOn: ["A"],
        writes: ["docs/w.md"],
        maxAttempts: 1,
        verification: [artifactGate("w", "docs/w.md")],
      }),
      approvedTask({ id: "J", dependsOn: ["W"], writes: ["docs/j.md"], verification: [artifactGate("j", "docs/j.md")] }),
    ]);
    const executor: TaskExecutor = {
      async execute(input) {
        if (input.taskId === "W") {
          await writeIn(input.workspace!.path, "docs/w.md", "ok\n");
          await writeIn(input.workspace!.path, "src/rogue.ts", "export {};\n");
          return reportFor(input, ["docs/w.md", "src/rogue.ts"]);
        }
        return reportFor(input);
      },
    };
    const { service, workspaces } = makeService(executor);
    const run = service.createRun(OWNER, { planId, maxWorkers: 2 });
    await service.settle();

    const final = service.getRun(OWNER, run.id);
    expect(final.status).toBe("failed");
    const writer = final.tasks.find((task) => task.taskId === "W");
    expect(writer?.state).toBe("failed");
    expect(writer?.verification?.[0]).toMatchObject({ gateId: "system:scope", passed: false });
    expect(writer?.verification?.[0]?.detail).toContain("src/rogue.ts");
    expect(final.tasks.find((task) => task.taskId === "J")?.state).toBe("blocked");

    const integration = workspaces.integrationPath(run.id);
    expect(existsSync(join(integration, "docs/w.md"))).toBe(false);
    expect(existsSync(join(integration, "src/rogue.ts"))).toBe(false);
  });

  it("holds a writer when a command gate fails, and keeps its evidence", async () => {
    const planId = createPlan([
      approvedTask({
        id: "W",
        writes: ["docs/w.md"],
        maxAttempts: 1,
        verification: [artifactGate("w", "docs/w.md"), commandGate("never", "exit 3")],
      }),
    ]);
    const executor: TaskExecutor = {
      async execute(input) {
        await writeIn(input.workspace!.path, "docs/w.md", "ok\n");
        return reportFor(input, ["docs/w.md"]);
      },
    };
    const { service, workspaces } = makeService(executor);
    const run = service.createRun(OWNER, { planId });
    await service.settle();

    const final = service.getRun(OWNER, run.id);
    expect(final.status).toBe("failed");
    const outcomes = final.tasks[0]?.verification ?? [];
    expect(outcomes.find((outcome) => outcome.gateId === "never")).toMatchObject({ passed: false, detail: "exit 3" });
    expect(outcomes.find((outcome) => outcome.gateId === "system:integration")).toBeUndefined();
    expect(existsSync(join(workspaces.integrationPath(run.id), "docs/w.md"))).toBe(false);
  });

  it("interrupts a running writer on halt and never integrates its late work", async () => {
    const planId = createPlan([
      approvedTask({ id: "A", reads: ["."], verification: [artifactGate("readme", "README.md")] }),
      approvedTask({ id: "W", dependsOn: ["A"], writes: ["docs/w.md"], verification: [artifactGate("w", "docs/w.md")] }),
    ]);
    const halted = new Set<string>();
    let release!: (value: unknown) => void;
    let writerStarted = false;
    const executor: TaskExecutor = {
      execute(input) {
        if (input.taskId !== "W") return Promise.resolve(reportFor(input));
        writerStarted = true;
        return new Promise((resolve, reject) => {
          release = () => {
            void writeIn(input.workspace!.path, "docs/w.md", "late\n").then(() => resolve(reportFor(input, ["docs/w.md"])));
          };
          input.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      },
    };
    const { service, workspaces } = makeService(executor, { halted });
    const run = service.createRun(OWNER, { planId });
    await until(() => writerStarted);
    const headBefore = git(workspaces.integrationPath(run.id), "rev-parse", "HEAD");

    halted.add(OWNER);
    expect(service.stopForUser(OWNER).stopped).toBe(1);
    release(undefined);
    await service.settle();

    const stopped = service.getRun(OWNER, run.id);
    expect(stopped.tasks.find((task) => task.taskId === "W")?.state).toBe("interrupted");
    expect(stopped.paused).toBe(true);
    expect(git(workspaces.integrationPath(run.id), "rev-parse", "HEAD")).toBe(headBefore);
    expect(() => service.createRun(OWNER, { planId })).toThrow();
  });

  it("stops a running writer on cancel and ignores its late report", async () => {
    const planId = createPlan([
      approvedTask({ id: "A", reads: ["."], verification: [artifactGate("readme", "README.md")] }),
      approvedTask({ id: "W", dependsOn: ["A"], writes: ["docs/w.md"], verification: [artifactGate("w", "docs/w.md")] }),
    ]);
    let writerStarted = false;
    const executor: TaskExecutor = {
      execute(input) {
        if (input.taskId !== "W") return Promise.resolve(reportFor(input));
        writerStarted = true;
        return new Promise((_, reject) => {
          input.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      },
    };
    const { service, workspaces } = makeService(executor);
    const run = service.createRun(OWNER, { planId });
    await until(() => writerStarted);
    const headBefore = git(workspaces.integrationPath(run.id), "rev-parse", "HEAD");

    const cancelled = service.cancelRun(OWNER, run.id, "operator stop");
    await service.settle();
    expect(cancelled.status).toBe("cancelled");
    expect(service.getRun(OWNER, run.id).tasks.find((task) => task.taskId === "W")?.state).toBe("cancelled");
    expect(git(workspaces.integrationPath(run.id), "rev-parse", "HEAD")).toBe(headBefore);
  });

  it("turns a writer left running by a restart into interrupted work for an operator", async () => {
    const planId = createPlan([
      approvedTask({ id: "A", reads: ["."], verification: [artifactGate("readme", "README.md")] }),
      approvedTask({ id: "W", dependsOn: ["A"], writes: ["docs/w.md"], verification: [artifactGate("w", "docs/w.md")] }),
    ]);
    let writerStarted = false;
    const crashed: TaskExecutor = {
      execute(input) {
        if (input.taskId !== "W") return Promise.resolve(reportFor(input));
        writerStarted = true;
        return new Promise(() => undefined);
      },
    };
    const first = makeService(crashed);
    const run = first.service.createRun(OWNER, { planId });
    await until(() => writerStarted);

    const restarted = makeService({ execute: async (input) => reportFor(input) });
    expect(restarted.service.recoverAfterRestart()).toBe(1);
    const recovered = restarted.service.getRun(OWNER, run.id);
    expect(recovered.status).toBe("interrupted");
    expect(recovered.paused).toBe(true);
    expect(recovered.tasks.find((task) => task.taskId === "W")?.state).toBe("interrupted");
    await flush();
  });

  it("keeps runs scoped to their owner and refuses plans without an owned repository", async () => {
    const planId = createPlan([approvedTask({ id: "A", reads: ["."], verification: [artifactGate("readme", "README.md")] })]);
    const { service } = makeService({ execute: async (input) => reportFor(input) });
    const run = service.createRun(OWNER, { planId });
    await service.settle();

    expect(() => service.getRun(OTHER, run.id)).toThrow(OrchestrationNotFoundError);
    expect(() => service.createRun(OTHER, { planId })).toThrow(OrchestrationNotFoundError);

    const unowned = createPlan(
      [approvedTask({ id: "W", writes: ["docs/w.md"], verification: [artifactGate("w", "docs/w.md")] })],
      "repo-missing",
    );
    expect(() => service.createRun(OWNER, { planId: unowned })).toThrow(OrchestrationValidationError);
    try {
      service.createRun(OWNER, { planId: unowned });
    } catch (error) {
      expect((error as OrchestrationValidationError).issues[0]?.code).toBe("workspace_required");
    }
  });

  it("never runs overlapping writers together, and the second sees the first one's integrated work", async () => {
    const planId = createPlan([
      approvedTask({ id: "A", reads: ["."], verification: [artifactGate("readme", "README.md")] }),
      approvedTask({ id: "W1", dependsOn: ["A"], writes: ["docs"], verification: [artifactGate("one", "docs/one.md")] }),
      approvedTask({
        id: "W2",
        dependsOn: ["A"],
        writes: ["docs/two.md"],
        verification: [artifactGate("two", "docs/two.md"), artifactGate("sees-one", "docs/one.md")],
      }),
    ]);
    let running = 0;
    let maxWriters = 0;
    const executor: TaskExecutor = {
      async execute(input) {
        if (input.taskId === "A") return reportFor(input);
        running += 1;
        maxWriters = Math.max(maxWriters, running);
        try {
          await flush();
          await writeIn(input.workspace!.path, input.taskId === "W1" ? "docs/one.md" : "docs/two.md", `${input.taskId}\n`);
          return reportFor(input);
        } finally {
          running -= 1;
        }
      },
    };
    const { service, workspaces } = makeService(executor);
    const run = service.createRun(OWNER, { planId, maxWorkers: 2 });
    await service.settle();

    // "docs" and "docs/two.md" overlap, so the scheduler must not run both at once.
    expect(maxWriters).toBe(1);
    const final = service.getRun(OWNER, run.id);
    expect(final.status).toBe("passed");
    expect(final.tasks.map((task) => task.state)).toEqual(["passed", "passed", "passed"]);
    expect(existsSync(join(workspaces.integrationPath(run.id), "docs/one.md"))).toBe(true);
    expect(existsSync(join(workspaces.integrationPath(run.id), "docs/two.md"))).toBe(true);
  });

  it("does not need git for tasks that declare no resources", async () => {
    const planId = createPlan([
      { ...approvedTask({ id: "A", verification: [commandGate("ok", "true")] }), resources: {} },
    ]);
    const service = new OrchestrationService({
      db,
      executor: { execute: async (input) => reportFor(input) },
      verifier: createWorkflowVerifier({ repositories, toolExecutor: shellExecutor }),
      workspaces: inertWorkspaces,
    });
    const run = service.createRun(OWNER, { planId });
    await service.settle();
    expect(service.getRun(OWNER, run.id).status).toBe("passed");
    expect(commands.at(-1)?.projectRoot).toBe(repo);
    expect(await readFile(join(repo, "README.md"), "utf8")).toBe("project\n");
  });
});
