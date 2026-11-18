import type { VerificationGate } from "@jait/shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type JaitDB, migrateDatabase, openDatabase } from "../../db/connection.js";
import type { SqliteDatabase } from "../../db/sqlite-shim.js";
import { PlanService } from "../plans.js";
import {
  OrchestrationService,
  OrchestrationValidationError,
  type TaskExecutionInput,
  type TaskExecutor,
  type VerificationRunner,
} from "./orchestrator.js";
import { OrchestrationStore } from "./store.js";

const USER = "user-1";

let sqlite: SqliteDatabase;
let db: JaitDB;

beforeEach(async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
});

afterEach(() => {
  sqlite.close();
});

const passingVerifier: VerificationRunner = { run: async () => ({ passed: true, detail: "ok" }) };

function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}

function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, description: "", dependsOn: [], verification: [gate()], ...extra };
}

function report(input: TaskExecutionInput, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles: [],
    artifacts: [],
    followUps: [],
    ...extra,
  };
}

function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}

function makeService(executor: TaskExecutor, verifier: VerificationRunner = passingVerifier): OrchestrationService {
  return new OrchestrationService({ db, executor, verifier });
}

it("keeps the trusted worker identity on an attempt after cancellation and rejects late updates", async () => {
  let active!: TaskExecutionInput;
  let complete!: () => void;
  const service = makeService({
    async execute(input) {
      active = input;
      input.recordAgentRef!("worker-from-runner");
      await new Promise<void>((resolve) => { complete = resolve; });
      return report(input);
    },
  });
  const run = service.createRun(USER, { title: "worker identity", tasks: [task("A")] });
  await vi.waitFor(() => expect(complete).toBeTypeOf("function"));
  const view = service.cancelRun(USER, run.id);
  expect(view.tasks[0]).toMatchObject({ state: "cancelled", agentRef: "worker-from-runner" });
  expect(new OrchestrationStore(db).getAttempts(run.id)[0]).toMatchObject({
    state: "cancelled", agentRef: "worker-from-runner",
  });
  expect(() => active.recordAgentRef!("late-worker")).toThrow("no longer owns");
  complete();
  await service.settle();
});

describe("dependency ordering", () => {
  it("starts a join only after both branches pass", async () => {
    const events: string[] = [];
    const executor: TaskExecutor = {
      execute: async (input) => {
        events.push(`start:${input.taskId}`);
        await Promise.resolve();
        events.push(`end:${input.taskId}`);
        return report(input);
      },
    };
    const service = makeService(executor);
    const run = service.createRun(USER, {
      title: "fan-in",
      maxWorkers: 2,
      tasks: [
        task("A"),
        task("B", { dependsOn: ["A"] }),
        task("C", { dependsOn: ["A"] }),
        task("D", { dependsOn: ["B", "C"] }),
      ],
    });
    await service.settle();
    expect(service.getRun(USER, run.id).status).toBe("passed");
    expect(events.indexOf("start:B")).toBeGreaterThan(events.indexOf("end:A"));
    expect(events.indexOf("start:D")).toBeGreaterThan(events.indexOf("end:B"));
    expect(events.indexOf("start:D")).toBeGreaterThan(events.indexOf("end:C"));
  });

  it("blocks the join when a branch fails and reports the run as failed", async () => {
    const executed: string[] = [];
    const executor: TaskExecutor = {
      execute: async (input) => {
        executed.push(input.taskId);
        return input.taskId === "B" ? report(input, { status: "failed", error: "compile error" }) : report(input);
      },
    };
    const service = makeService(executor);
    const run = service.createRun(USER, {
      title: "branch failure",
      tasks: [
        task("A"),
        task("B", { dependsOn: ["A"], maxAttempts: 1 }),
        task("C", { dependsOn: ["A"] }),
        task("D", { dependsOn: ["B", "C"] }),
      ],
    });
    await service.settle();
    const final = service.getRun(USER, run.id);
    expect(final.status).toBe("failed");
    expect(stateOf(final, "B")).toBe("failed");
    expect(stateOf(final, "C")).toBe("passed");
    expect(stateOf(final, "D")).toBe("blocked");
    expect(executed).not.toContain("D");
  });
});

describe("attempts and verification", () => {
  it("stops retrying once the attempt budget is spent", async () => {
    const executor: TaskExecutor = {
      execute: vi.fn(async (input: TaskExecutionInput) => report(input, { status: "failed", error: "nope" })),
    };
    const service = makeService(executor);
    const run = service.createRun(USER, { title: "budget", tasks: [task("A", { maxAttempts: 2 })] });
    await service.settle();
    expect(executor.execute).toHaveBeenCalledTimes(2);
    const final = service.getRun(USER, run.id);
    expect(stateOf(final, "A")).toBe("failed");
    expect(final.tasks[0]?.attemptCount).toBe(2);
    expect(final.status).toBe("failed");
  });

  it("repairs after a failed gate with the failure as context and records the verdicts", async () => {
    let verdicts = 0;
    const verifier: VerificationRunner = {
      run: async () => {
        verdicts += 1;
        return verdicts === 1 ? { passed: false, detail: "file missing" } : { passed: true, detail: "ok" };
      },
    };
    const inputs: TaskExecutionInput[] = [];
    const executor: TaskExecutor = {
      execute: async (input) => {
        inputs.push(input);
        return report(input);
      },
    };
    const service = makeService(executor, verifier);
    const run = service.createRun(USER, { title: "repair", tasks: [task("A", { maxAttempts: 2 })] });
    await service.settle();
    const final = service.getRun(USER, run.id);
    expect(final.status).toBe("passed");
    expect(inputs).toHaveLength(2);
    expect(inputs[1]?.previousAttempt?.error).toContain("verification failed");
    expect(inputs[1]?.previousAttempt?.verification?.[0]).toMatchObject({ passed: false, detail: "file missing" });
    expect(final.tasks[0]?.verification).toEqual([expect.objectContaining({ passed: true })]);
  });

  it("never passes a task on a report it cannot validate", async () => {
    const verifier: VerificationRunner = { run: vi.fn(async () => ({ passed: true, detail: "ok" })) };
    const executor: TaskExecutor = {
      execute: async (input) => ({ ...report(input), verified: true }),
    };
    const service = makeService(executor, verifier);
    const run = service.createRun(USER, { title: "invalid", tasks: [task("A", { maxAttempts: 1 })] });
    await service.settle();
    const final = service.getRun(USER, run.id);
    expect(stateOf(final, "A")).toBe("failed");
    expect(final.status).toBe("failed");
    expect(verifier.run).not.toHaveBeenCalled();
    expect(final.tasks[0]?.lastError).toContain('may not set "verified"');
  });

  it("fails closed when no verification runner is configured", async () => {
    const executor: TaskExecutor = { execute: async (input) => report(input) };
    const service = new OrchestrationService({ db, executor });
    const run = service.createRun(USER, { title: "closed", tasks: [task("A", { maxAttempts: 1 })] });
    await service.settle();
    const final = service.getRun(USER, run.id);
    expect(final.status).toBe("failed");
    expect(final.tasks[0]?.verification?.[0]?.detail).toContain("no verification runner");
  });

  it("allows one operator retry after the attempt budget is spent", async () => {
    let failing = true;
    const executor: TaskExecutor = {
      execute: async (input) => report(input, failing ? { status: "failed", error: "boom" } : {}),
    };
    const service = makeService(executor);
    const run = service.createRun(USER, { title: "retry", tasks: [task("A", { maxAttempts: 1 })] });
    await service.settle();
    expect(service.getRun(USER, run.id).status).toBe("failed");
    failing = false;
    service.retryTask(USER, run.id, "A");
    await service.settle();
    const final = service.getRun(USER, run.id);
    expect(final.status).toBe("passed");
    expect(final.tasks[0]?.attemptCount).toBe(2);
  });
});

describe("validation and plans", () => {
  it("rejects a cyclic plan before anything is persisted", () => {
    const executor: TaskExecutor = { execute: vi.fn(async (input: TaskExecutionInput) => report(input)) };
    const service = makeService(executor);
    let thrown: unknown;
    try {
      service.createRun(USER, {
        title: "cycle",
        tasks: [task("A", { dependsOn: ["B"] }), task("B", { dependsOn: ["A"] })],
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(OrchestrationValidationError);
    expect((thrown as OrchestrationValidationError).issues.map((issue) => issue.code)).toContain("cycle");
    expect(service.listRuns(USER)).toHaveLength(0);
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("refuses plan tasks a person has not approved and persists nothing", () => {
    const plans = new PlanService(db);
    const plan = plans.create({
      repoId: "repo-1",
      userId: USER,
      title: "Agent proposal",
      tasks: [
        { id: "A", title: "Task A", description: "", status: "approved", verification: [gate()] },
        { id: "B", title: "Task B", description: "", status: "proposed", verification: [gate()] },
        { id: "C", title: "Task C", description: "", status: "skipped", verification: [gate()] },
      ],
    });
    const executor: TaskExecutor = { execute: vi.fn(async (input: TaskExecutionInput) => report(input)) };
    const service = makeService(executor);
    let thrown: unknown;
    try {
      service.createRun(USER, { planId: plan.id });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(OrchestrationValidationError);
    const issues = (thrown as OrchestrationValidationError).issues;
    expect(issues.map((issue) => issue.code)).toEqual(["task_not_approved", "task_not_approved"]);
    expect(issues.map((issue) => issue.taskId)).toEqual(["B", "C"]);
    expect(service.listRuns(USER)).toHaveLength(0);
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("starts from a stored plan and keeps the run's snapshot when the plan changes", async () => {
    const plans = new PlanService(db);
    const plan = plans.create({
      repoId: "repo-1",
      userId: USER,
      title: "Plan",
      tasks: [{ id: "A", title: "Task A", description: "", status: "approved", verification: [gate()] }],
    });
    const executor: TaskExecutor = { execute: async (input) => report(input) };
    const service = makeService(executor);
    const run = service.createRun(USER, { planId: plan.id });
    plans.update(plan.id, {
      title: "Edited",
      tasks: [{ id: "Z", title: "Other", description: "", status: "approved", verification: [gate()] }],
    });
    await service.settle();
    const view = service.getRun(USER, run.id);
    expect(view.planId).toBe(plan.id);
    expect(view.title).toBe("Plan");
    expect(view.tasks.map((item) => item.taskId)).toEqual(["A"]);
    expect(view.status).toBe("passed");
  });
});
