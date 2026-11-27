import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { inertWorkspaces } from "../services/orchestration/inert-workspaces.js";
import { OrchestrationService } from "../services/orchestration/orchestrator.js";
import { PlanService } from "../services/plans.js";
import { RepositoryService } from "../services/repositories.js";
import type { ToolContext, ToolDefinition } from "./contracts.js";
import { createPlanTools } from "./plan-tools.js";

const owner = "owner-1";
const root = "/work/project";
const gate = { id: "out", label: "Result exists", check: { kind: "artifact", path: "result.txt" } };

function contextFor(userId: string | undefined, projectRoot = root): ToolContext {
  return { userId, sessionId: "chat-1", actionId: "action-1", projectRoot, requestedBy: "agent" } as ToolContext;
}

describe("plan.create", () => {
  let database: Awaited<ReturnType<typeof openDatabase>>;
  let plans: PlanService;
  let repos: RepositoryService;
  let repoId: string;
  let onCreated: ReturnType<typeof vi.fn>;
  let tool: ToolDefinition;

  beforeEach(async () => {
    database = await openDatabase(":memory:");
    migrateDatabase(database.sqlite);
    plans = new PlanService(database.db);
    repos = new RepositoryService(database.db);
    repoId = repos.create({ userId: owner, name: "project", localPath: root }).id;
    onCreated = vi.fn();
    tool = createPlanTools({ planService: plans, repoService: repos, onCreated })[0]!;
  });

  afterEach(() => database.sqlite.close());

  it("saves a draft with every task proposed, even when the input claims approval", async () => {
    const result = await tool.execute({
      title: "Two steps",
      tasks: [
        { id: "A", title: "First", verification: [gate] },
        { id: "B", title: "Second", dependsOn: ["A"], resources: { writes: ["src"] }, verification: [gate] },
      ],
    }, contextFor(owner));
    expect(result.ok).toBe(true);
    const { planId, order } = result.data as { planId: string; order: string[] };
    expect(order).toEqual(["A", "B"]);
    const stored = plans.getById(planId)!;
    expect(stored).toMatchObject({ userId: owner, repoId, status: "draft", title: "Two steps" });
    expect(stored.tasks.map((task) => task.status)).toEqual(["proposed", "proposed"]);
    expect(stored.tasks[1]).toMatchObject({ dependsOn: ["A"], resources: { writes: ["src"] }, description: "" });
    expect(stored.tasks[0]).not.toHaveProperty("resources");
    expect(onCreated).toHaveBeenCalledWith(stored);

    await expect(tool.execute({
      title: "Self-approved",
      tasks: [{ id: "A", title: "First", status: "approved", verification: [gate] }],
    }, contextFor(owner))).rejects.toThrow();
    expect(plans.listByUser(owner)).toHaveLength(1);
  });

  it("refuses an invalid graph and saves nothing", async () => {
    const result = await tool.execute({
      title: "Cycle",
      tasks: [
        { id: "A", title: "First", dependsOn: ["B"], verification: [gate] },
        { id: "B", title: "Second", dependsOn: ["A"], verification: [] },
      ],
    }, contextFor(owner));
    expect(result.ok).toBe(false);
    const codes = (result.data as { issues: Array<{ code: string }> }).issues.map((issue) => issue.code);
    expect(codes).toContain("missing_verification");
    expect(plans.listByUser(owner)).toEqual([]);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("only writes to the caller's own repository", async () => {
    const foreign = repos.create({ userId: "someone-else", name: "theirs", localPath: "/work/theirs" }).id;
    const tasks = [{ id: "A", title: "First", verification: [gate] }];
    expect(await tool.execute({ title: "P", repoId: foreign, tasks }, contextFor(owner)))
      .toEqual({ ok: false, message: "Repository not found" });
    expect((await tool.execute({ title: "P", tasks }, contextFor(owner, "/work/theirs"))).ok).toBe(false);
    await expect(tool.execute({ title: "P", tasks }, contextFor(undefined))).rejects.toThrow("signed-in owner");
    expect(plans.listByUser("someone-else")).toEqual([]);
    expect(plans.listByUser(owner)).toEqual([]);
  });

  it("produces a plan that cannot run until the owner approves its tasks", async () => {
    const orchestration = new OrchestrationService({
      db: database.db,
      workspaces: inertWorkspaces,
      isHalted: () => false,
      executor: {
        execute: ({ signal }) => new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
      },
    });
    try {
      const result = await tool.execute({ title: "P", tasks: [{ id: "A", title: "First", verification: [gate] }] }, contextFor(owner));
      const { planId } = result.data as { planId: string };
      expect(() => orchestration.createRun(owner, { planId })).toThrow(/approve/i);

      const draft = plans.getById(planId)!;
      plans.update(planId, { tasks: draft.tasks.map((task) => ({ ...task, status: "approved" as const })) });
      expect(orchestration.createRun(owner, { planId })).toMatchObject({ planId });
    } finally {
      orchestration.stopForUser(owner);
      await orchestration.settle();
    }
  });
});
