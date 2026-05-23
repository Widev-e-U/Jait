import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";
import type { RepositoryService, RepoRow } from "../services/repositories.js";
import type { RepoProposalService } from "../services/repo-proposals.js";
import type { ThreadService } from "../services/threads.js";

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringOrNull(record: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in record)) return undefined;
  const value = record[key];
  if (value === null || value === "") return null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readTags(record: Record<string, unknown>): string[] | undefined {
  if (!("tags" in record)) return undefined;
  const value = record.tags;
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean))]
    .slice(0, 12);
}

function readStatus(record: Record<string, unknown>): "open" | "in_progress" | "done" | undefined {
  const value = readString(record, "status");
  return value === "open" || value === "in_progress" || value === "done" ? value : undefined;
}

function readPriority(record: Record<string, unknown>): "low" | "normal" | "high" | undefined {
  const value = readString(record, "priority");
  return value === "low" || value === "normal" || value === "high" ? value : undefined;
}

function readDueDate(record: Record<string, unknown>): string | null | undefined {
  const value = readStringOrNull(record, "dueDate");
  if (value === undefined || value === null) return value;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function matchRepositoryForProject(
  repositories: RepoRow[],
  projectRoot: string,
): RepoRow | null {
  const direct = repositories.find((repo) => projectRoot.startsWith(repo.localPath));
  if (direct) return direct;
  return repositories.find((repo) => projectRoot.includes(repo.name)) ?? null;
}

export function createJaitTodosTool(deps: {
  repoService: RepositoryService;
  repoProposalService: RepoProposalService;
  threadService?: ThreadService;
}): ToolDefinition {
  return {
    name: "jait.todos",
    description:
      "Manage global Jait todo items for future agent threads. Use this to save worthwhile follow-up work in the Todo page.",
    tier: "core",
    category: "gateway",
    source: "builtin",
    risk: "low",
    defaultConsentLevel: "none",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "add", "update", "remove"],
          description: "Operation to perform.",
        },
        repoId: {
          type: "string",
          description: "Explicit repository ID. Omit to infer it from the current projectRoot.",
        },
        todoId: {
          type: "string",
          description: "Todo ID. Required for action=update or action=remove.",
        },
        message: {
          type: "string",
          description: "Future user message or task to save. Required for action=add.",
        },
        status: {
          type: "string",
          enum: ["open", "in_progress", "done"],
          description: "Todo status.",
        },
        priority: {
          type: "string",
          enum: ["low", "normal", "high"],
          description: "Todo priority.",
        },
        dueDate: {
          type: "string",
          description: "Optional due date in YYYY-MM-DD format. Use an empty string to clear it.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional lowercase tags for grouping/filtering todos.",
        },
      },
      required: ["action"],
    },
    execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const body = input && typeof input === "object" && !Array.isArray(input)
        ? input as Record<string, unknown>
        : {};
      const action = readString(body, "action");
      if (!action) {
        return { ok: false, message: "action is required" };
      }

      const repositories = deps.repoService.list(context.userId);
      const repoId = readString(body, "repoId");
      const repo = repoId
        ? repositories.find((item) => item.id === repoId) ?? null
        : matchRepositoryForProject(repositories, context.projectRoot);
      if (!repo) {
        return { ok: false, message: "Could not resolve a repository for this todo action." };
      }

      if (action === "list") {
        const todos = deps.repoProposalService.listByRepo(repo.id);
        return {
          ok: true,
          message: `Loaded ${todos.length} todo${todos.length === 1 ? "" : "s"} for ${repo.name}.`,
          data: { repo, todos },
        };
      }

      if (action === "add") {
        const message = readString(body, "message");
        if (!message) return { ok: false, message: "message is required for add" };
        const thread = deps.threadService?.getById(context.sessionId);
        const proposal = deps.repoProposalService.create({
          repoId: repo.id,
          userId: context.userId,
          message,
          status: readStatus(body),
          priority: readPriority(body),
          dueDate: readDueDate(body),
          tags: readTags(body),
          sourceThreadId: thread?.id ?? null,
          sourceThreadTitle: thread?.title ?? null,
        });
        return {
          ok: true,
          message: `Saved a Jait todo for ${repo.name}.`,
          data: { repo, todo: proposal },
        };
      }

      if (action === "update") {
        const todoId = readString(body, "todoId");
        if (!todoId) return { ok: false, message: "todoId is required for update" };
        const existing = deps.repoProposalService.getById(todoId);
        if (!existing || existing.repoId !== repo.id || existing.userId !== (context.userId ?? null)) {
          return { ok: false, message: "Todo not found." };
        }
        const message = readString(body, "message");
        const todo = deps.repoProposalService.update(existing.id, {
          message,
          status: readStatus(body),
          priority: readPriority(body),
          dueDate: readDueDate(body),
          tags: readTags(body),
        });
        return {
          ok: true,
          message: `Updated Jait todo for ${repo.name}.`,
          data: { repo, todo },
        };
      }

      if (action === "remove") {
        const todoId = readString(body, "todoId");
        if (!todoId) return { ok: false, message: "todoId is required for remove" };
        const todo = deps.repoProposalService.getById(todoId);
        if (!todo || todo.repoId !== repo.id || todo.userId !== (context.userId ?? null)) {
          return { ok: false, message: "Todo not found." };
        }
        deps.repoProposalService.delete(todoId);
        return {
          ok: true,
          message: `Removed Jait todo from ${repo.name}.`,
          data: { repoId: repo.id, todoId },
        };
      }

      return { ok: false, message: `Unsupported action: ${action}` };
    },
  };
}
