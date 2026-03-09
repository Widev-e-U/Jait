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
/** Per-session todo state */
const sessionTodos = new Map();
/** Get todo list for a session */
export function getSessionTodos(sessionId) {
    return sessionTodos.get(sessionId) ?? [];
}
/** Clear todo list for a session (e.g. on session delete) */
export function clearSessionTodos(sessionId) {
    sessionTodos.delete(sessionId);
}
export function createTodoTool() {
    return {
        name: "todo",
        description: "Manage a structured todo list to track progress and plan tasks throughout your session. " +
            "Use this tool frequently to ensure task visibility and proper planning.\n\n" +
            "**When to use:**\n" +
            "- Complex multi-step work requiring planning and tracking\n" +
            "- When the user provides multiple tasks or requests\n" +
            "- After receiving new instructions that require multiple steps\n" +
            "- BEFORE starting work on any todo (mark as in-progress)\n" +
            "- IMMEDIATELY after completing each todo (mark as completed)\n" +
            "- When breaking down larger tasks into smaller actionable steps\n\n" +
            "**When NOT to use:**\n" +
            "- Single, trivial tasks that can be completed in one step\n" +
            "- Purely conversational/informational requests\n\n" +
            "**Rules:**\n" +
            "- Provide the COMPLETE todo list every time (all items, both old and new)\n" +
            "- At most ONE item can be `in-progress` at a time\n" +
            "- Mark todos completed immediately after finishing — do not batch completions\n" +
            "- Use sequential IDs starting from 1\n" +
            "- Keep titles concise (3-7 words) and action-oriented",
        tier: "core",
        category: "meta",
        source: "builtin",
        parameters: {
            type: "object",
            properties: {
                todoList: {
                    type: "array",
                    description: "Complete array of all todo items. Must include ALL items — both existing and new. " +
                        "Items not included will be removed.",
                    items: {
                        type: "object",
                        properties: {
                            id: {
                                type: "number",
                                description: "Unique identifier. Use sequential numbers starting from 1.",
                            },
                            title: {
                                type: "string",
                                description: "Concise action-oriented todo label (3-7 words). Displayed in UI.",
                            },
                            status: {
                                type: "string",
                                description: "not-started: Not begun | in-progress: Currently working (max 1) | completed: Fully finished",
                                enum: ["not-started", "in-progress", "completed"],
                            },
                        },
                        required: ["id", "title", "status"],
                    },
                },
            },
            required: ["todoList"],
        },
        async execute(input, context) {
            try {
                const items = input.todoList;
                // Validate: at most one in-progress
                const inProgress = items.filter((t) => t.status === "in-progress");
                if (inProgress.length > 1) {
                    return {
                        ok: false,
                        message: `Only one todo can be in-progress at a time. Found ${inProgress.length}: ` +
                            inProgress.map((t) => `"${t.title}"`).join(", "),
                    };
                }
                // Normalize and store
                const normalized = items.map((t) => ({
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
            }
            catch (err) {
                return {
                    ok: false,
                    message: err instanceof Error ? err.message : "Todo update failed",
                };
            }
        },
    };
}
//# sourceMappingURL=todo.js.map