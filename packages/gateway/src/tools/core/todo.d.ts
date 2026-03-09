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
import type { ToolDefinition } from "../contracts.js";
/** A single todo / plan item */
export interface TodoItem {
    /** Unique identifier (sequential number starting from 1) */
    id: number;
    /** Concise action-oriented label (3-7 words) */
    title: string;
    /** Current status */
    status: "not-started" | "in-progress" | "completed";
}
/** Get todo list for a session */
export declare function getSessionTodos(sessionId: string): TodoItem[];
/** Clear todo list for a session (e.g. on session delete) */
export declare function clearSessionTodos(sessionId: string): void;
interface TodoInput {
    /** Complete array of ALL todo items. Must include both existing and new items.
     *  Items not included will be removed. */
    todoList: {
        id: number;
        title: string;
        status: "not-started" | "in-progress" | "completed";
    }[];
}
export declare function createTodoTool(): ToolDefinition<TodoInput>;
export {};
//# sourceMappingURL=todo.d.ts.map