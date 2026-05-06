import { describe, expect, it } from "vitest";
import { createJaitTodosTool } from "./repo-proposal-tools.js";
import type { RepoRow } from "../services/repositories.js";
import type { RepoProposalRow } from "../services/repo-proposals.js";
import type { ToolContext } from "./contracts.js";

const repo: RepoRow = {
  id: "repo-1",
  userId: "user-1",
  deviceId: "gateway",
  name: "Jait",
  defaultBranch: "main",
  localPath: "/workspace/jait",
  githubUrl: null,
  strategy: null,
  createdAt: "2026-05-06T00:00:00.000Z",
  updatedAt: "2026-05-06T00:00:00.000Z",
};

const context: ToolContext = {
  sessionId: "thread-1",
  actionId: "action-1",
  workspaceRoot: "/workspace/jait",
  requestedBy: "user",
  userId: "user-1",
};

function createTodo(overrides: Partial<RepoProposalRow>): RepoProposalRow {
  return {
    id: "todo-1",
    repoId: "repo-1",
    userId: "user-1",
    message: "Follow up",
    status: "open",
    priority: "normal",
    dueDate: null,
    tags: "[]",
    sourceThreadId: null,
    sourceThreadTitle: null,
    createdAt: "2026-05-06T00:00:00.000Z",
    updatedAt: "2026-05-06T00:00:00.000Z",
    ...overrides,
  };
}

describe("createJaitTodosTool", () => {
  it("registers the global jait.todos tool", () => {
    const tool = createJaitTodosTool({
      repoService: { list: () => [repo] } as any,
      repoProposalService: {} as any,
    });

    expect(tool.name).toBe("jait.todos");
    expect(tool.tier).toBe("core");
    expect(tool.parameters.properties.action.enum).toContain("update");
    expect(tool.parameters.properties.todoId).toBeDefined();
  });

  it("adds todo metadata and exposes todos in list results", async () => {
    const todos: RepoProposalRow[] = [];
    const tool = createJaitTodosTool({
      repoService: { list: () => [repo] } as any,
      repoProposalService: {
        listByRepo: () => todos,
        create: (params: any) => {
          const todo = createTodo({
            id: `todo-${todos.length + 1}`,
            message: params.message,
            priority: params.priority,
            dueDate: params.dueDate,
            tags: JSON.stringify(params.tags),
          });
          todos.unshift(todo);
          return todo;
        },
      } as any,
      threadService: { getById: () => ({ id: "thread-1", title: "Thread One" }) } as any,
    });

    const addResult = await tool.execute({
      action: "add",
      message: "Polish todo tags",
      priority: "high",
      dueDate: "2026-05-10",
      tags: ["UI", "todo"],
    }, context);
    const listResult = await tool.execute({ action: "list" }, context);

    expect(addResult.ok).toBe(true);
    expect(addResult.message).toContain("Saved a Jait todo");
    expect((addResult.data as any).todo).toMatchObject({
      message: "Polish todo tags",
      priority: "high",
      dueDate: "2026-05-10",
      tags: JSON.stringify(["ui", "todo"]),
    });
    expect((listResult.data as any).todos).toHaveLength(1);
  });
});
