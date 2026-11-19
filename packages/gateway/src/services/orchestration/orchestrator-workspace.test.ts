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
  protects?: string[];
  verification: VerificationGate[];
  maxAttempts?: number;
}

/** A human-approved plan task. Resources are declared only where given. */
function approvedTask(input: PlanTaskInput) {
  const resources: { reads?: string[]; writes?: string[]; protects?: string[] } = {};
  if (input.reads) resources.reads = input.reads;
  if (input.writes) resources.writes = input.writes;
  if (input.protects) resources.protects = input.protects;
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
    // Dependency edges are part of the run view that owners inspect.
    expect(final.tasks.map((task) => [task.taskId, task.dependsOn])).toEqual([
      ["A", []],
      ["B", ["A"]],
      ["C", ["A"]],
      ["D", ["B", "C"]],
    ]);
    // So are the resources each task owns, which is what lets B and C run side by side.
    expect(final.tasks.map((task) => [task.taskId, task.resources])).toEqual([
      ["A", { reads: ["."], writes: [], protects: [] }],
      ["B", { reads: [], writes: ["docs/guide.md"], protects: [] }],
      ["C", { reads: [], writes: ["docs/notes.md"], protects: [] }],
      ["D", { reads: [], writes: ["docs/summary.md"], protects: [] }],
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

  it("checks the combined integration state in an approved join before advancing", async () => {
    const invariant = "test ! -e docs/a.md || test ! -e docs/b.md";
    const planId = createPlan([
      approvedTask({ id: "A", writes: ["docs/a.md"], verification: [artifactGate("a", "docs/a.md")] }),
      approvedTask({ id: "B", writes: ["docs/b.md"], verification: [artifactGate("b", "docs/b.md")] }),
      approvedTask({ id: "J", dependsOn: ["A", "B"], reads: ["."], maxAttempts: 1, verification: [commandGate("combined", invariant)] }),
      approvedTask({ id: "D", dependsOn: ["J"], reads: ["."], verification: [artifactGate("readme", "README.md")] }),
    ]);
    const started: string[] = [];
    let writers = 0;
    const executor: TaskExecutor = {
      async execute(input) {
        started.push(input.taskId);
        if (input.taskId === "A" || input.taskId === "B") {
          writers += 1;
          await until(() => writers === 2);
          const file = `docs/${input.taskId.toLowerCase()}.md`;
          await writeIn(input.workspace!.path, file, input.taskId);
          return reportFor(input, [file]);
        }
        return reportFor(input);
      },
    };
    const { service, workspaces } = makeService(executor);
    const run = service.createRun(OWNER, { planId, maxWorkers: 2 });
    await service.settle();

    const final = service.getRun(OWNER, run.id);
    expect(final.status).toBe("failed");
    expect(final.tasks.map((task) => [task.taskId, task.state])).toEqual([
      ["A", "passed"], ["B", "passed"], ["J", "failed"], ["D", "blocked"],
    ]);
    expect(final.tasks.find((task) => task.taskId === "J")?.verification).toMatchObject([
      { gateId: "combined", passed: false },
    ]);
    expect(started).not.toContain("D");
    expect(commands).toEqual([{ command: invariant, projectRoot: workspaces.integrationPath(run.id), requestedBy: "workflow" }]);
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

  /** Existing project files committed before the run starts, so writers have tracked files to change or delete. */
  async function seedProject(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }

  it("fails a writer that weakens a protected test, and integrates nothing", async () => {
    await seedProject({ "tests/keep.test.ts": "it('works', () => {});\n", "src/lib.ts": "export {};\n" });
    const planId = createPlan([
      approvedTask({
        id: "W",
        writes: ["."],
        protects: ["tests"],
        maxAttempts: 1,
        verification: [artifactGate("impl", "src/impl.ts")],
      }),
      approvedTask({ id: "J", dependsOn: ["W"], writes: ["docs/j.md"], verification: [artifactGate("j", "docs/j.md")] }),
    ]);
    const seen: Array<string[] | undefined> = [];
    const executor: TaskExecutor = {
      async execute(input) {
        seen.push(input.claims.protects);
        if (input.taskId === "W") {
          await writeIn(input.workspace!.path, "src/impl.ts", "export const impl = 1;\n");
          // The agent makes the failing check pass by skipping the test.
          await writeIn(input.workspace!.path, "tests/keep.test.ts", "it.skip('works', () => {});\n");
          return reportFor(input, ["src/impl.ts", "tests/keep.test.ts"]);
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
    expect(writer?.resources).toEqual({ reads: [], writes: ["."], protects: ["tests"] });
    expect(writer?.verification?.[0]).toMatchObject({ gateId: "system:scope", passed: false });
    expect(writer?.verification?.[0]?.label).toContain("protected paths untouched");
    expect(writer?.verification?.[0]?.detail).toBe("protected paths changed: tests/keep.test.ts");
    expect(writer?.lastError).toContain("verification failed");
    // The plan's own gates never ran, so the weakened test cannot make the task look successful.
    expect(writer?.verification?.map((outcome) => outcome.gateId)).toEqual(["system:scope"]);
    expect(final.tasks.find((task) => task.taskId === "J")?.state).toBe("blocked");
    expect(seen[0]).toEqual(["tests"]);

    const integration = workspaces.integrationPath(run.id);
    expect(existsSync(join(integration, "src/impl.ts"))).toBe(false);
    expect(await readFile(join(integration, "tests/keep.test.ts"), "utf8")).toBe("it('works', () => {});\n");
  });

  it("blocks a committed protected test change before a dependent task advances", async () => {
    await seedProject({ "tests/keep.test.ts": "original\n" });
    const planId = createPlan([
      approvedTask({ id: "W", writes: ["."], protects: ["tests"], maxAttempts: 1, verification: [artifactGate("impl", "src/impl.ts")] }),
      approvedTask({ id: "J", dependsOn: ["W"], writes: ["docs/j.md"], verification: [artifactGate("j", "docs/j.md")] }),
    ]);
    const executor: TaskExecutor = {
      async execute(input) {
        if (input.taskId === "W") {
          await writeIn(input.workspace!.path, "src/impl.ts", "implementation\n");
          await writeIn(input.workspace!.path, "tests/keep.test.ts", "weakened\n");
          git(input.workspace!.path, "add", "src/impl.ts", "tests/keep.test.ts");
          git(input.workspace!.path, "commit", "-q", "-m", "worker commit");
        }
        return reportFor(input);
      },
    };
    const { service, workspaces } = makeService(executor);
    const run = service.createRun(OWNER, { planId, maxWorkers: 2 });
    await service.settle();
    const final = service.getRun(OWNER, run.id);
    expect(final.status).toBe("failed");
    expect(final.tasks.find((task) => task.taskId === "W")?.verification?.[0]).toMatchObject({
      gateId: "system:scope", passed: false, detail: "protected paths changed: tests/keep.test.ts",
    });
    expect(final.tasks.find((task) => task.taskId === "J")?.state).toBe("blocked");
    const integration = workspaces.integrationPath(run.id);
    expect(await readFile(join(integration, "tests/keep.test.ts"), "utf8")).toBe("original\n");
    expect(existsSync(join(integration, "src/impl.ts"))).toBe(false);
  });

  it("lets a writer add tests and delete a file it does not protect, and records the deletion", async () => {
    await seedProject({
      "tests/keep.test.ts": "it('works', () => {});\n",
      "src/old.ts": "export const old = 1;\n",
    });
    const planId = createPlan([
      approvedTask({
        id: "W",
        writes: ["src", "tests"],
        protects: ["tests/keep.test.ts"],
        verification: [artifactGate("impl", "src/impl.ts"), commandGate("new-test", "test -s tests/new.test.ts")],
      }),
    ]);
    const executor: TaskExecutor = {
      async execute(input) {
        await writeIn(input.workspace!.path, "src/impl.ts", "export const impl = 1;\n");
        await writeIn(input.workspace!.path, "tests/new.test.ts", "it('new', () => {});\n");
        await rm(join(input.workspace!.path, "src/old.ts"));
        return reportFor(input, []); // The agent omitted every change; evidence must still show git-observed paths.
      },
    };
    const { service, workspaces } = makeService(executor);
    const run = service.createRun(OWNER, { planId });
    await service.settle();

    const final = service.getRun(OWNER, run.id);
    expect(final.status).toBe("passed");
    const scope = final.tasks[0]?.verification?.find((outcome) => outcome.gateId === "system:scope");
    expect(scope).toMatchObject({ passed: true });
    expect(scope?.detail).toBe("3 changed file(s) inside scope; changed: src/impl.ts, src/old.ts, tests/new.test.ts; deleted: src/old.ts");

    const integration = workspaces.integrationPath(run.id);
    expect(existsSync(join(integration, "tests/new.test.ts"))).toBe(true);
    expect(existsSync(join(integration, "src/old.ts"))).toBe(false);
    expect(await readFile(join(integration, "tests/keep.test.ts"), "utf8")).toBe("it('works', () => {});\n");
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

  /** Lets another writer "land" on the integration branch right before a task integrates. */
  function landOtherWorkBeforeIntegrate(workspaces: WorkflowWorkspaces, limit: number): { calls: () => number } {
    const original = workspaces.integrate.bind(workspaces);
    let calls = 0;
    workspaces.integrate = async (ref, ...rest) => {
      calls += 1;
      if (calls <= limit) {
        const path = workspaces.integrationPath(ref.runId);
        await writeIn(path, `other/landed-${calls}.md`, `${calls}\n`);
        git(path, "add", `other/landed-${calls}.md`);
        git(path, "commit", "-q", "-m", `other writer ${calls}`);
      }
      return original(ref, ...rest);
    };
    return { calls: () => calls };
  }

  const staleWriterPlan = () =>
    createPlan([
      approvedTask({
        id: "W",
        writes: ["docs/w.md"],
        verification: [artifactGate("w", "docs/w.md"), commandGate("w-check", "test -s docs/w.md")],
      }),
    ]);
  const writeW: TaskExecutor = {
    async execute(input) {
      await writeIn(input.workspace!.path, "docs/w.md", "ok\n");
      return reportFor(input, ["docs/w.md"]);
    },
  };

  it("re-syncs and re-verifies a writer whose integration went stale, then integrates it", async () => {
    const planId = staleWriterPlan();
    const { service, workspaces } = makeService(writeW);
    const spy = landOtherWorkBeforeIntegrate(workspaces, 1);
    const run = service.createRun(OWNER, { planId });
    await service.settle();

    const final = service.getRun(OWNER, run.id);
    expect(final.status).toBe("passed");
    expect(spy.calls()).toBe(2);
    expect(commands.filter((entry) => entry.command === "test -s docs/w.md")).toHaveLength(2);
    const integration = workspaces.integrationPath(run.id);
    expect(existsSync(join(integration, "docs/w.md"))).toBe(true);
    expect(existsSync(join(integration, "other/landed-1.md"))).toBe(true);
  });

  it("holds a writer as interrupted when integration keeps advancing past its re-sync rounds", async () => {
    const planId = staleWriterPlan();
    const { service, workspaces } = makeService(writeW);
    const spy = landOtherWorkBeforeIntegrate(workspaces, 10);
    const run = service.createRun(OWNER, { planId });
    await service.settle();

    const final = service.getRun(OWNER, run.id);
    expect(final.tasks[0]?.state).toBe("interrupted");
    expect(final.status).not.toBe("completed");
    expect(spy.calls()).toBe(3);
    expect(commands.filter((entry) => entry.command === "test -s docs/w.md")).toHaveLength(3);
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
