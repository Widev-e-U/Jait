import { describe, expect, it, vi } from "vitest";
import { BackgroundTaskManager, type BackgroundTask } from "./tools.js";

function makeTask(overrides: Partial<BackgroundTask> = {}): BackgroundTask {
  return {
    id: "task-1",
    title: "Test task",
    threadId: "thread-1",
    providerId: "codex",
    status: "running",
    startedAt: Date.now(),
    ...overrides,
  };
}

describe("BackgroundTaskManager", () => {
  it("register + list + get reflect the added task with status running", () => {
    const manager = new BackgroundTaskManager();
    const task = makeTask();
    manager.register(task);

    expect(manager.list()).toHaveLength(1);
    expect(manager.list()[0]).toBe(task);
    expect(manager.get("task-1")).toBe(task);
    expect(manager.get("task-1")?.status).toBe("running");
  });

  it("update mutates the stored object in place (result/status/error)", () => {
    const manager = new BackgroundTaskManager();
    const task = makeTask();
    manager.register(task);

    manager.update("task-1", { status: "completed", result: "the answer" });
    expect(manager.get("task-1")?.status).toBe("completed");
    expect(manager.get("task-1")?.result).toBe("the answer");
    // Same object reference — in-place mutation.
    expect(manager.get("task-1")).toBe(task);

    manager.update("task-1", { status: "error", error: "boom" });
    expect(manager.get("task-1")?.status).toBe("error");
    expect(manager.get("task-1")?.error).toBe("boom");

    // Updating an unknown id is a no-op.
    manager.update("does-not-exist", { status: "completed" });
    expect(manager.get("does-not-exist")).toBeUndefined();
  });

  it("remove drops the task (get -> undefined, list empty)", () => {
    const manager = new BackgroundTaskManager();
    const task = makeTask();
    const cancelFn = vi.fn(async () => {});
    manager.register(task, cancelFn);

    manager.remove("task-1");
    expect(manager.get("task-1")).toBeUndefined();
    expect(manager.list()).toHaveLength(0);
  });

  it("cancel on a running task: sets status cancelled + cancelled flag, awaits cancelFn, returns true", async () => {
    const manager = new BackgroundTaskManager();
    const task = makeTask();
    const cancelFn = vi.fn(async () => {});
    manager.register(task, cancelFn);

    const result = await manager.cancel("task-1");

    expect(result).toBe(true);
    expect(cancelFn).toHaveBeenCalledTimes(1);
    expect(task.status).toBe("cancelled");
    expect(task.cancelled).toBe(true);
  });

  it("cancel on a non-running task returns false and does not call cancelFn", async () => {
    const manager = new BackgroundTaskManager();
    const task = makeTask({ status: "completed" });
    const cancelFn = vi.fn(async () => {});
    manager.register(task, cancelFn);

    const result = await manager.cancel("task-1");

    expect(result).toBe(false);
    expect(cancelFn).not.toHaveBeenCalled();
    expect(task.status).toBe("completed");
    expect(task.cancelled).toBeUndefined();
  });

  it("cancel on an unknown id returns false", async () => {
    const manager = new BackgroundTaskManager();
    const result = await manager.cancel("nope");
    expect(result).toBe(false);
  });

  it("clear marks running tasks cancelled and clears the map; fire-and-forget cancelFn is called", async () => {
    const manager = new BackgroundTaskManager();
    const running1 = makeTask({ id: "r1" });
    const running2 = makeTask({ id: "r2", title: "Second" });
    const completed = makeTask({ id: "c1", status: "completed" });

    const cancelFn1 = vi.fn(async () => {});
    const cancelFn2 = vi.fn(async () => {});
    manager.register(running1, cancelFn1);
    manager.register(running2, cancelFn2);
    manager.register(completed);

    manager.clear();

    expect(manager.list()).toHaveLength(0);
    expect(manager.get("r1")).toBeUndefined();
    expect(running1.status).toBe("cancelled");
    expect(running1.cancelled).toBe(true);
    expect(running2.status).toBe("cancelled");
    expect(running2.cancelled).toBe(true);
    // Completed tasks should NOT be marked cancelled by clear().
    expect(completed.status).toBe("completed");

    // cancelFn is fired fire-and-forget (void). Give the microtask queue a tick.
    await new Promise((resolve) => setImmediate(resolve));
    await Promise.resolve();
    expect(cancelFn1).toHaveBeenCalledTimes(1);
    expect(cancelFn2).toHaveBeenCalledTimes(1);
  });
});