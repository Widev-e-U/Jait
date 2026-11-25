import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { VerificationGate } from "@jait/shared/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type JaitDB, migrateDatabase, openDatabase } from "../../db/connection.js";
import type { SqliteDatabase } from "../../db/sqlite-shim.js";
import { inertWorkspaces } from "./inert-workspaces.js";
import {
  OrchestrationConflictError,
  OrchestrationService,
  type OwnershipEvent,
  type TaskExecutionInput,
  type TaskExecutor,
  type VerificationRunner,
} from "./orchestrator.js";
import { FileOrchestrationLease, LEASE_FILE_NAME } from "./process-lease.js";

/**
 * Two gateway processes on one database are modelled as two services with their
 * own lease pids over the same connection. The lease file is real.
 */

async function workflowArtifactsRoot(): Promise<string> {
  const root = resolve(import.meta.dirname, "../../../../../.jait/artifacts");
  await mkdir(root, { recursive: true });
  return root;
}

const USER = "user-1";
const OWNER_PID = 4001;
const STANDBY_PID = 4002;

let sqlite: SqliteDatabase;
let db: JaitDB;
let leaseDir: string;

beforeEach(async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  leaseDir = await mkdtemp(join(await workflowArtifactsRoot(), "jait-orchestrator-lease-"));
});

afterEach(async () => {
  sqlite.close();
  await rm(leaseDir, { recursive: true, force: true });
});

const passingVerifier: VerificationRunner = { run: async () => ({ passed: true, detail: "ok" }) };
const neverCalled: TaskExecutor = {
  execute: async () => {
    throw new Error("a standby process must not dispatch");
  },
};

function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}

function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, description: "", dependsOn: [], verification: [gate()], ...extra };
}

function report(input: TaskExecutionInput): Record<string, unknown> {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles: [],
    artifacts: [],
    followUps: [],
  };
}

function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Attempts stay open until their stop signal fires, as a worker does when it is stopped. */
function abortableExecutor() {
  const started: TaskExecutionInput[] = [];
  const executor: TaskExecutor = {
    execute: (input) =>
      new Promise((_resolve, reject) => {
        started.push(input);
        input.signal.addEventListener("abort", () => reject(input.signal.reason), { once: true });
      }),
  };
  return { executor, started };
}

const leaseFile = () => join(leaseDir, LEASE_FILE_NAME);
/** A process is alive only if it is in `alive`. */
const aliveSet = (...alive: number[]) => (pid: number) => alive.includes(pid);

function serviceAs(pid: number, executor: TaskExecutor, options: {
  alive?: (pid: number) => boolean;
  onOwnership?: (event: OwnershipEvent) => void;
} = {}): OrchestrationService {
  return new OrchestrationService({
    db,
    executor,
    verifier: passingVerifier,
    workspaces: inertWorkspaces,
    isHalted: () => false,
    lease: new FileOrchestrationLease(leaseFile(), { pid, isAlive: options.alive ?? aliveSet(OWNER_PID) }),
    leaseRetryMs: 0,
    onOwnership: options.onOwnership,
  });
}

describe("single owner per database", () => {
  it("a standby process neither recovers nor pauses the owner's runs, and refuses plan writes", async () => {
    const live = abortableExecutor();
    const owner = serviceAs(OWNER_PID, live.executor);
    expect(owner.acquireOwnership()).toBe(true);
    const run = owner.createRun(USER, { title: "live", tasks: [task("A"), task("B", { dependsOn: ["A"] })] });
    await flush();
    expect(live.started).toHaveLength(1);

    const events: OwnershipEvent[] = [];
    const standby = serviceAs(STANDBY_PID, neverCalled, { onOwnership: (event) => events.push(event) });
    expect(standby.acquireOwnership()).toBe(false);
    expect(standby.isOwner()).toBe(false);
    expect(() => standby.recoverAfterRestart()).toThrow(OrchestrationConflictError);
    expect(() => standby.createRun(USER, { title: "refused", tasks: [task("X")] })).toThrow(OrchestrationConflictError);
    expect(() => standby.cancelRun(USER, run.id)).toThrow(OrchestrationConflictError);
    expect(() => standby.resumeRun(USER, run.id)).toThrow(OrchestrationConflictError);
    expect(standby.takeOverIfFree()).toBe(false);
    await standby.close();

    const view = owner.getRun(USER, run.id);
    expect(view).toMatchObject({ status: "running", paused: false });
    expect(stateOf(view, "A")).toBe("running");
    expect(live.started[0]!.signal.aborted).toBe(false);
    expect(events).toEqual([{ owner: false, reason: "another live gateway process owns this database" }]);

    await owner.close();
  });

  it("the owner's close pauses its work and frees the lease, so a standby takes over and waits for an operator", async () => {
    const live = abortableExecutor();
    const owner = serviceAs(OWNER_PID, live.executor);
    owner.acquireOwnership();
    const run = owner.createRun(USER, { title: "handoff", tasks: [task("A")] });
    await flush();

    await owner.close();
    expect(live.started[0]!.signal.aborted).toBe(true);
    expect(existsSync(leaseFile())).toBe(false);

    const executed: TaskExecutionInput[] = [];
    const events: OwnershipEvent[] = [];
    const successor = serviceAs(STANDBY_PID, {
      execute: async (input) => {
        executed.push(input);
        return report(input);
      },
    }, { onOwnership: (event) => events.push(event) });
    expect(successor.takeOverIfFree()).toBe(true);
    expect(successor.isOwner()).toBe(true);

    const recovered = successor.getRun(USER, run.id);
    expect(recovered).toMatchObject({ status: "interrupted", paused: true });
    expect(stateOf(recovered, "A")).toBe("interrupted");
    expect(events.at(-1)).toMatchObject({ owner: true, reason: "lease acquired" });
    await successor.settle();
    expect(executed).toHaveLength(0);

    successor.resumeRun(USER, run.id, [{ taskId: "A", decision: "retry", note: "workspace reviewed" }]);
    await successor.settle();
    expect(executed.map((input) => input.taskId)).toEqual(["A"]);
    expect(successor.getRun(USER, run.id).status).toBe("passed");
    await successor.close();
  });

  it("takes over a database whose owner died without closing, and interrupts the work it left", async () => {
    const crashed = abortableExecutor();
    const owner = serviceAs(OWNER_PID, crashed.executor);
    owner.acquireOwnership();
    const run = owner.createRun(USER, { title: "crash", tasks: [task("A")] });
    await flush();
    expect(crashed.started).toHaveLength(1);

    // The owner process is gone: its pid no longer exists and it never closed.
    const events: OwnershipEvent[] = [];
    const successor = serviceAs(STANDBY_PID, neverCalled, {
      alive: aliveSet(),
      onOwnership: (event) => events.push(event),
    });
    expect(successor.takeOverIfFree()).toBe(true);

    const view = successor.getRun(USER, run.id);
    expect(view).toMatchObject({ status: "interrupted", paused: true });
    expect(stateOf(view, "A")).toBe("interrupted");
    expect(events).toEqual([{ owner: true, reason: "lease acquired", interrupted: 1 }]);
    await successor.close();
  });

  it("a standby retries in the background and takes over as soon as the owner releases", async () => {
    const owner = serviceAs(OWNER_PID, abortableExecutor().executor);
    owner.acquireOwnership();

    const standby = new OrchestrationService({
      db,
      executor: neverCalled,
      verifier: passingVerifier,
      workspaces: inertWorkspaces,
      isHalted: () => false,
      lease: new FileOrchestrationLease(leaseFile(), { pid: STANDBY_PID, isAlive: aliveSet(OWNER_PID) }),
      leaseRetryMs: 5,
    });
    expect(standby.acquireOwnership()).toBe(false);

    await owner.close();
    await expect.poll(() => standby.isOwner(), { timeout: 2_000 }).toBe(true);
    await standby.close();
  });

  it("a service without a lease owns the database, as before", () => {
    const service = new OrchestrationService({ db, executor: neverCalled, workspaces: inertWorkspaces });

    expect(service.isOwner()).toBe(true);
    expect(service.acquireOwnership()).toBe(true);
    expect(service.recoverAfterRestart()).toBe(0);
  });
});
