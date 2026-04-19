/**
 * todo — Manage a structured task list to track progress.
 *
 * Inspired by VS Code Copilot's manage_todo_list:
 * - Full array-based update (provide ALL items each time)
 * - Status tracking: not-started → in-progress → completed
 * - At most one item can be in-progress at a time
 * - Per-session state stored in memory
 *
 * The tool emits a `todo_list` SSE event via the agent loop
 * so the UI can render the plan in real time.
 */

import type { ToolDefinition, ToolResult, ToolContext } from "../contracts.js";

/** A single todo / plan item */
export interface TodoItem {
  /** Unique identifier (sequential number starting from 1) */
  id: number;
  /** Concise action-oriented label (3-7 words) */
  title: string;
  /** Current status */
  status: "not-started" | "in-progress" | "completed";
}

/** Per-session todo state */
const sessionTodos = new Map<string, TodoItem[]>();

/** Get todo list for a session */
export function getSessionTodos(sessionId: string): TodoItem[] {
  return sessionTodos.get(sessionId) ?? [];
}

/** Clear todo list for a session (e.g. on session delete) */
export function clearSessionTodos(sessionId: string): void {
  sessionTodos.delete(sessionId);
}

interface TodoInput {
  /** Complete array of ALL todo items. Must include both existing and new items.
   *  Items not included will be removed. */
  todoList: {
    id: number;
    title: string;
    status: "not-started" | "in-progress" | "completed";
  }[];
}

export function createTodoTool(): ToolDefinition<TodoInput> {
  return {
    name: "todo",
    description:
      "Manage a structured todo list for tracking multi-step tasks. " +
      "Provide the COMPLETE list each time. At most one item can be in-progress.",
    tier: "core",
    category: "meta",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        todoList: {
          type: "array",
          description: "Complete array of all todo items.",
          items: {
            type: "object",
            properties: {
              id: {
                type: "number",
                description: "Sequential ID starting from 1.",
              },
              title: {
                type: "string",
                description: "Concise action label (3-7 words).",
              },
              status: {
                type: "string",
                enum: ["not-started", "in-progress", "completed"],
              },
            },
            required: ["id", "title", "status"],
          },
        },
      },
      required: ["todoList"],
    },
    async execute(input: TodoInput, context: ToolContext): Promise<ToolResult> {
      try {
        const items = input.todoList;

        // Validate: at most one in-progress
        const inProgress = items.filter((t) => t.status === "in-progress");
        if (inProgress.length > 1) {
          return {
            ok: false,
            message:
              `Only one todo can be in-progress at a time. Found ${inProgress.length}: ` +
              inProgress.map((t) => `"${t.title}"`).join(", "),
          };
        }

        // Normalize and store
        const normalized: TodoItem[] = items.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
        }));

        sessionTodos.set(context.sessionId, normalized);

        const completed = normalized.filter((t) => t.status === "completed").length;
        const total = normalized.length;
        const current = inProgress[0]?.title;

        return {
          ok: true,
          message: current
            ? `Todo list updated (${completed}/${total} done). Working on: ${current}`
            : `Todo list updated (${completed}/${total} done).`,
          data: { items: normalized },
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Todo update failed",
        };
      }
    },
  };
}
