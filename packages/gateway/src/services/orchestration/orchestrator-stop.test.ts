import type { VerificationGate } from "@jait/shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type JaitDB, migrateDatabase, openDatabase } from "../../db/connection.js";
import type { SqliteDatabase } from "../../db/sqlite-shim.js";
import { inertWorkspaces } from "./inert-workspaces.js";
import {
  OrchestrationService,
  type TaskExecutionInput,
  type TaskExecutor,
  type VerificationRunner,
} from "./orchestrator.js";

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

/** A task without resources: no workspace, so the test isolates scheduling and gates. */
function task(id: string): Record<string, unknown> {
  return { id, title: `Task ${id}`, description: "", dependsOn: [], resources: {}, verification: [gate()] };
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

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("stopped gates keep their worker until they settle", () => {
  it("does not free an attempt while its stopped gate may still be running, and ignores its late verdict", async () => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    let gateStarted = false;
    const verifier: VerificationRunner = {
      async run() {
        gateStarted = true;
        await released;
        return { passed: true, detail: "late pass" };
      },
    };
    const executor: TaskExecutor = { execute: async (input) => report(input) };
    const service = new OrchestrationService({ db, executor, verifier, workspaces: inertWorkspaces });
    const run = service.createRun(USER, { title: "stop", tasks: [task("A")] });
    await vi.waitFor(() => expect(gateStarted).toBe(true));

    expect(service.stopForUser(USER).stopped).toBe(1);
    expect(service.getRun(USER, run.id).tasks[0]).toMatchObject({ state: "interrupted" });

    let settled = false;
    const waiting = service.settle().then(() => { settled = true; });
    await pause(30);
    expect(settled).toBe(false);

    release();
    await waiting;
    expect(service.getRun(USER, run.id).tasks[0]).toMatchObject({ state: "interrupted" });
  });
});

describe("shutdown", () => {
  it("interrupts and drains active work without dispatching queued tasks", async () => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const started: TaskExecutionInput[] = [];
    const executor: TaskExecutor = {
      async execute(input) {
        started.push(input);
        await released;
        return report(input);
      },
    };
    const service = new OrchestrationService({ db, executor, verifier: passingVerifier, workspaces: inertWorkspaces });
    const run = service.createRun(USER, { title: "shutdown", maxWorkers: 1, tasks: [task("A"), task("B")] });
    await vi.waitFor(() => expect(started).toHaveLength(1));

    let closed = false;
    const closing = service.close().then(() => { closed = true; });
    expect(started[0]!.signal.aborted).toBe(true);
    expect(service.getRun(USER, run.id)).toMatchObject({ paused: true });
    expect(service.getRun(USER, run.id).tasks[0]).toMatchObject({ state: "interrupted" });
    expect(() => service.createRun(USER, { title: "late", tasks: [task("C")] })).toThrow("shutting down");
    await pause(30);
    expect(closed).toBe(false);
    release();
    await closing;
    await service.close();
    await pause(0);
    expect(started).toHaveLength(1);
    expect(service.getRun(USER, run.id).tasks[0]).toMatchObject({ state: "interrupted" });
  });
});

describe("provider-aware concurrency", () => {
  it("caps concurrent attempts per owner and provider, even when the run allows more workers", async () => {
    let running = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const executor: TaskExecutor = {
      async execute(input) {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise<void>((resolve) => releases.push(resolve));
        running -= 1;
        return report(input);
      },
    };
    const service = new OrchestrationService({
      db, executor, verifier: passingVerifier, workspaces: inertWorkspaces, perProviderMaxWorkers: 2,
    });
    const run = service.createRun(USER, {
      title: "fan out", maxWorkers: 4, tasks: [task("A"), task("B"), task("C"), task("D")],
    });

    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect(peak).toBe(2);
    for (let finished = 0; finished < 4; finished += 1) {
      await vi.waitFor(() => expect(releases.length).toBeGreaterThan(0));
      releases.shift()!();
      await pause(5);
      expect(peak).toBeLessThanOrEqual(2);
    }
    await service.settle();
    expect(service.getRun(USER, run.id).status).toBe("passed");
    expect(peak).toBe(2);
  });

  it("applies the provider cap per owner, so one owner's attempts do not block another's", async () => {
    let running = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const executor: TaskExecutor = {
      async execute(input) {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise<void>((resolve) => releases.push(resolve));
        running -= 1;
        return report(input);
      },
    };
    const service = new OrchestrationService({
      db, executor, verifier: passingVerifier, workspaces: inertWorkspaces, perProviderMaxWorkers: 2,
    });
    service.createRun("user-1", { title: "first owner", maxWorkers: 2, tasks: [task("A"), task("B")] });
    service.createRun("user-2", { title: "second owner", maxWorkers: 2, tasks: [task("C"), task("D")] });

    await vi.waitFor(() => expect(releases).toHaveLength(4));
    expect(peak).toBe(4);
    while (releases.length > 0) releases.shift()!();
    await service.settle();
  });
});
