import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase, type JaitDB, type SqliteDatabase } from "../../db/connection.js";
import { inertWorkspaces } from "./inert-workspaces.js";
import {
  OrchestrationConflictError,
  OrchestrationNotFoundError,
  OrchestrationService,
  type TaskExecutionInput,
  type TaskExecutor,
} from "./orchestrator.js";

const artifacts = resolve(import.meta.dirname, "../../../../../.jait/artifacts");

function completed(input: TaskExecutionInput) {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} result`,
    changedFiles: [],
    artifacts: [],
    followUps: [],
  };
}

function service(db: JaitDB, executor: TaskExecutor) {
  return new OrchestrationService({
    db,
    executor,
    verifier: { run: async () => ({ passed: true, detail: "ok" }) },
    workspaces: inertWorkspaces,
  });
}

async function until(condition: () => boolean) {
  const deadline = Date.now() + 3_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("worker did not start");
    await new Promise((resolveWait) => setTimeout(resolveWait, 5));
  }
}

describe("workflow persistence", () => {
  it("reopens a shut down workflow and resumes with its persisted dependency result", async () => {
    await mkdir(artifacts, { recursive: true });
    const dir = await mkdtemp(join(artifacts, "workflow-persistence-"));
    const dbPath = join(dir, "jait.db");
    let sqlite: SqliteDatabase | undefined;
    let current: OrchestrationService | undefined;
    try {
      const first = await openDatabase(dbPath);
      sqlite = first.sqlite;
      migrateDatabase(sqlite);
      let secondStarted = false;
      current = service(first.db, {
        execute: async (input) => {
          if (input.taskId === "A") return completed(input);
          secondStarted = true;
          return new Promise((_resolve, reject) => {
            input.signal.addEventListener("abort", () => reject(new Error("shutdown")), { once: true });
          });
        },
      });
      const gate = { id: "check", label: "check", check: { kind: "artifact", path: "result.txt" } };
      const run = current.createRun("owner", {
        title: "persistent workflow",
        tasks: [
          { id: "A", title: "A", description: "", dependsOn: [], verification: [gate] },
          { id: "B", title: "B", description: "", dependsOn: ["A"], verification: [gate] },
        ],
      });
      await until(() => secondStarted);
      await current.close();
      sqlite.close();
      current = undefined;
      sqlite = undefined;

      const reopened = await openDatabase(dbPath);
      sqlite = reopened.sqlite;
      migrateDatabase(sqlite);
      const calls: TaskExecutionInput[] = [];
      current = service(reopened.db, {
        execute: async (input) => {
          calls.push(input);
          return completed(input);
        },
      });
      expect(current.recoverAfterRestart()).toBe(0);
      const recovered = current.getRun("owner", run.id);
      expect(recovered.paused).toBe(true);
      expect(recovered.tasks.map(({ taskId, state }) => [taskId, state])).toEqual([
        ["A", "passed"],
        ["B", "interrupted"],
      ]);
      expect(() => current!.getRun("other-owner", run.id)).toThrow(OrchestrationNotFoundError);
      expect(() => current!.resumeRun("owner", run.id)).toThrow(OrchestrationConflictError);
      expect(calls).toHaveLength(0);

      current.resumeRun("owner", run.id, [{ taskId: "B", decision: "retry", note: "reviewed" }]);
      await current.settle();
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        taskId: "B",
        attemptNo: 2,
        dependencyResults: [{ taskId: "A", summary: "A result", changedFiles: [], artifacts: [] }],
      });
      expect(current.getRun("owner", run.id).status).toBe("passed");
    } finally {
      await current?.close();
      sqlite?.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
