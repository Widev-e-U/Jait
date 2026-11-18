import type { VerificationGate } from "@jait/shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type JaitDB, migrateDatabase, openDatabase } from "../../db/connection.js";
import type { SqliteDatabase } from "../../db/sqlite-shim.js";
import { AgentHaltedError } from "../agent-control.js";
import { inertWorkspaces } from "./inert-workspaces.js";
import {
  OrchestrationConflictError,
  OrchestrationNotFoundError,
  OrchestrationService,
  type TaskExecutionInput,
  type TaskExecutor,
  type VerificationRunner,
} from "./orchestrator.js";

const USER = "user-1";

let sqlite: SqliteDatabase;
let db: JaitDB;
let halted: Set<string>;

beforeEach(async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  halted = new Set();
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

function retry(taskId: string) {
  return { taskId, decision: "retry" as const, note: "workspace checked" };
}

function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}

function makeService(executor: TaskExecutor, extra: { globalMaxWorkers?: number } = {}): OrchestrationService {
  return new OrchestrationService({
    db,
    executor,
    verifier: passingVerifier,
    workspaces: inertWorkspaces,
    isHalted: (userId) => halted.has(userId),
    ...extra,
  });
}

/** An executor whose attempts stay open until the test resolves them. */
function holdingExecutor() {
  const attempts: Array<{ input: TaskExecutionInput; resolve: (value: unknown) => void }> = [];
  const executor: TaskExecutor = {
    execute: (input) =>
      new Promise((resolve) => {
        attempts.push({ input, resolve });
      }),
  };
  return { executor, attempts };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("halt", () => {
  it("interrupts running work, pauses the owner's runs and refuses new work until resumed", async () => {
    const { executor, attempts } = holdingExecutor();
    const service = makeService(executor);
    const run = service.createRun(USER, { title: "halt", tasks: [task("A", { maxAttempts: 3 })] });
    await flush();
    expect(attempts).toHaveLength(1);

    halted.add(USER);
    expect(service.stopForUser(USER).stopped).toBe(1);
    const halted1 = service.getRun(USER, run.id);
    expect(stateOf(halted1, "A")).toBe("interrupted");
    expect(halted1.status).toBe("interrupted");
    expect(halted1.paused).toBe(true);
    expect(() => service.createRun(USER, { title: "new", tasks: [task("X")] })).toThrow(AgentHaltedError);
    expect(() => service.resumeRun(USER, run.id, [retry("A")])).toThrow(AgentHaltedError);

    // Unhalted, but the stopped executor is still running: resume must wait for it.
    halted.delete(USER);
    expect(() => service.resumeRun(USER, run.id, [retry("A")])).toThrow(OrchestrationConflictError);
    attempts[0]?.resolve(report(attempts[0].input));
    await flush();

    service.resumeRun(USER, run.id, [retry("A")]);
    await flush();
    expect(attempts).toHaveLength(2);
    expect(attempts[1]?.input.attemptNo).toBe(2);
    attempts[1]?.resolve(report(attempts[1].input));
    await service.settle();
    expect(service.getRun(USER, run.id).status).toBe("passed");
  });
});

describe("cancel", () => {
  it("cancels running work, signals the executor and ignores its late report", async () => {
    const { executor, attempts } = holdingExecutor();
    const service = makeService(executor);
    const run = service.createRun(USER, { title: "cancel", tasks: [task("A"), task("B", { dependsOn: ["A"] })] });
    await flush();
    const cancelled = service.cancelRun(USER, run.id, "operator stop");
    expect(attempts[0]?.input.signal.aborted).toBe(true);
    expect(cancelled.status).toBe("cancelled");
    expect(stateOf(cancelled, "A")).toBe("cancelled");
    expect(stateOf(cancelled, "B")).toBe("cancelled");

    attempts[0]?.resolve(report(attempts[0].input));
    await service.settle();
    const final = service.getRun(USER, run.id);
    expect(final.status).toBe("cancelled");
    expect(stateOf(final, "A")).toBe("cancelled");
  });
});

describe("restart", () => {
  it("turns unfinished attempts into interrupted work that only an operator can re-run", async () => {
    const crashed = holdingExecutor();
    const before = makeService(crashed.executor);
    const run = before.createRun(USER, { title: "restart", tasks: [task("A"), task("B", { dependsOn: ["A"] })] });
    await flush();
    expect(crashed.attempts).toHaveLength(1);

    const executed: TaskExecutionInput[] = [];
    const executor: TaskExecutor = {
      execute: async (input) => {
        executed.push(input);
        return report(input);
      },
    };
    const after = makeService(executor);
    expect(after.recoverAfterRestart()).toBe(1);
    const recovered = after.getRun(USER, run.id);
    expect(recovered.status).toBe("interrupted");
    expect(recovered.paused).toBe(true);
    expect(stateOf(recovered, "A")).toBe("interrupted");
    expect(stateOf(recovered, "B")).toBe("pending");
    expect(() => after.resumeRun(USER, run.id)).toThrow(OrchestrationConflictError);
    await after.settle();
    expect(executed).toHaveLength(0);

    after.resumeRun(USER, run.id, [{ taskId: "A", decision: "retry", note: "workspace reviewed" }]);
    await after.settle();
    expect(executed.map((input) => input.taskId)).toEqual(["A", "B"]);
    expect(executed[0]?.attemptNo).toBe(2);
    expect(after.getRun(USER, run.id).status).toBe("passed");
  });

  it("ignores a late report from the process that crashed", async () => {
    const crashed = holdingExecutor();
    const before = makeService(crashed.executor);
    const run = before.createRun(USER, { title: "late", tasks: [task("A")] });
    const after = makeService({ execute: async (input) => report(input) });
    after.recoverAfterRestart();

    crashed.attempts[0]?.resolve(report(crashed.attempts[0].input));
    await before.settle();
    const view = after.getRun(USER, run.id);
    expect(stateOf(view, "A")).toBe("interrupted");
    expect(view.status).toBe("interrupted");
  });
});

describe("timeouts", () => {
  it("treats a timed-out attempt as interrupted instead of retrying it", async () => {
    const executor: TaskExecutor = {
      execute: vi.fn(
        (input: TaskExecutionInput) =>
          new Promise((_resolve, reject) => {
            input.signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      ),
    };
    const service = makeService(executor);
    const run = service.createRun(USER, {
      title: "timeout",
      tasks: [task("A", { timeoutSeconds: 1, maxAttempts: 3 })],
    });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await service.settle();
    expect(executor.execute).toHaveBeenCalledTimes(1);
    const view = service.getRun(USER, run.id);
    expect(stateOf(view, "A")).toBe("interrupted");
    expect(view.tasks[0]?.lastError).toContain("timed out");
  }, 5000);
});

describe("ownership and worker limits", () => {
  it("keeps runs scoped to their owner", () => {
    const { executor } = holdingExecutor();
    const service = makeService(executor);
    const run = service.createRun(USER, { title: "mine", tasks: [task("A")] });
    expect(() => service.getRun("someone-else", run.id)).toThrow(OrchestrationNotFoundError);
    expect(() => service.cancelRun("someone-else", run.id)).toThrow(OrchestrationNotFoundError);
    expect(service.listRuns("someone-else")).toEqual([]);
  });

  it("respects the process-wide limit across runs and fills freed slots", async () => {
    const { executor, attempts } = holdingExecutor();
    const service = makeService(executor, { globalMaxWorkers: 1 });
    service.createRun(USER, { title: "one", tasks: [task("A")] });
    service.createRun(USER, { title: "two", tasks: [task("B")] });
    await flush();
    expect(attempts).toHaveLength(1);

    attempts[0]?.resolve(report(attempts[0].input));
    await flush();
    expect(attempts).toHaveLength(2);
    attempts[1]?.resolve(report(attempts[1].input));
    await service.settle();
    expect(service.listRuns(USER).map((run) => run.status)).toEqual(["passed", "passed"]);
  });
});
