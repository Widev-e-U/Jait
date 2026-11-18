import { describe, expect, it } from "vitest";
import { computeDependencyChanges, type SchedulableTask, selectDispatch } from "./scheduler.js";

function item(taskId: string, state: SchedulableTask["state"], extra: Partial<SchedulableTask> = {}): SchedulableTask {
  return { taskId, state, order: 0, priority: 0, claims: { reads: [], writes: [] }, ...extra };
}

const writes = (...keys: string[]) => ({ reads: [], writes: keys });
const reads = (...keys: string[]) => ({ reads: keys, writes: [] });

describe("selectDispatch", () => {
  it("starts independent ready tasks up to the worker limit and defers the rest", () => {
    const tasks = [
      item("B", "ready", { order: 1, claims: writes("b") }),
      item("C", "ready", { order: 2, claims: writes("c") }),
      item("D", "ready", { order: 3, claims: writes("d") }),
    ];
    const decision = selectDispatch({ tasks, maxWorkers: 2, halted: false });
    expect(decision.start).toEqual(["B", "C"]);
    expect(decision.deferred).toEqual([{ taskId: "D", reason: "worker_limit" }]);
  });

  it("counts running and verifying tasks against the limit", () => {
    const tasks = [
      item("A", "verifying", { order: 0, claims: writes("a") }),
      item("B", "ready", { order: 1, claims: writes("b") }),
    ];
    expect(selectDispatch({ tasks, maxWorkers: 1, halted: false }).start).toEqual([]);
    expect(selectDispatch({ tasks, maxWorkers: 2, halted: false }).start).toEqual(["B"]);
  });

  it("never starts two tasks that write overlapping resources", () => {
    const tasks = [
      item("B", "ready", { order: 1, claims: writes("src") }),
      item("C", "ready", { order: 2, claims: writes("src/lib.rs") }),
    ];
    const decision = selectDispatch({ tasks, maxWorkers: 2, halted: false });
    expect(decision.start).toEqual(["B"]);
    expect(decision.deferred).toEqual([{ taskId: "C", reason: "resource_conflict" }]);
  });

  it("lets readers share a resource and blocks writers against readers", () => {
    const readers = [
      item("B", "ready", { order: 1, claims: reads("docs") }),
      item("C", "ready", { order: 2, claims: reads("docs") }),
    ];
    expect(selectDispatch({ tasks: readers, maxWorkers: 2, halted: false }).start).toEqual(["B", "C"]);
    const mixed = [
      item("B", "ready", { order: 1, claims: reads("src") }),
      item("C", "ready", { order: 2, claims: writes("src/a") }),
    ];
    expect(selectDispatch({ tasks: mixed, maxWorkers: 2, halted: false }).start).toEqual(["B"]);
  });

  it("keeps claims of a task whose executor is still alive, even when its state says interrupted", () => {
    const tasks = [
      item("A", "interrupted", { order: 0, claims: writes("src"), inFlight: true }),
      item("B", "ready", { order: 1, claims: writes("src") }),
    ];
    const decision = selectDispatch({ tasks, maxWorkers: 4, halted: false });
    expect(decision.start).toEqual([]);
    expect(decision.deferred).toEqual([{ taskId: "B", reason: "resource_conflict" }]);
  });

  it("starts nothing while halted and prefers higher priority", () => {
    const tasks = [
      item("X", "ready", { order: 0, claims: writes("x") }),
      item("Y", "ready", { order: 1, priority: 5, claims: writes("y") }),
    ];
    expect(selectDispatch({ tasks, maxWorkers: 2, halted: true }).start).toEqual([]);
    expect(selectDispatch({ tasks, maxWorkers: 1, halted: false }).start).toEqual(["Y"]);
  });

  it("respects external capacity from process-wide limits", () => {
    const tasks = [item("X", "ready", { order: 0, claims: writes("x") })];
    expect(selectDispatch({ tasks, maxWorkers: 4, halted: false, externalCapacity: 0 }).start).toEqual([]);
  });
});

describe("computeDependencyChanges", () => {
  it("blocks the whole chain behind a failed dependency", () => {
    const changes = computeDependencyChanges(
      [
        { taskId: "A", state: "failed", dependsOn: [] },
        { taskId: "B", state: "pending", dependsOn: ["A"] },
        { taskId: "C", state: "pending", dependsOn: ["B"] },
      ],
      ["A", "B", "C"],
    );
    expect(changes).toEqual([
      { taskId: "B", from: "pending", to: "blocked" },
      { taskId: "C", from: "pending", to: "blocked" },
    ]);
  });

  it("returns a blocked dependent to pending when its dependency is retried", () => {
    const changes = computeDependencyChanges(
      [
        { taskId: "A", state: "ready", dependsOn: [] },
        { taskId: "B", state: "blocked", dependsOn: ["A"] },
      ],
      ["A", "B"],
    );
    expect(changes).toEqual([{ taskId: "B", from: "blocked", to: "pending" }]);
  });

  it("readies a pending dependent once all its dependencies passed", () => {
    const changes = computeDependencyChanges(
      [
        { taskId: "A", state: "passed", dependsOn: [] },
        { taskId: "B", state: "pending", dependsOn: ["A"] },
      ],
      ["A", "B"],
    );
    expect(changes).toEqual([{ taskId: "B", from: "pending", to: "ready" }]);
  });
});
