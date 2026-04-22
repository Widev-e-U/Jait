export interface TodoResultItem {
  id: number;
  title: string;
  status: "not-started" | "in-progress" | "completed";
}

function isTodoStatus(value: unknown): value is TodoResultItem["status"] {
  return value === "not-started" || value === "in-progress" || value === "completed";
}

function normalizeTodoToolName(toolName: string | null | undefined): string {
  const normalized = toolName?.trim().toLowerCase() ?? "";
  if (!normalized) return "";
  if (normalized === "todo" || normalized === "todowrite") return "todo";
  if (normalized.endsWith("__todo")) return "todo";
  if (normalized.endsWith("manage_todo_list")) return "todo";
  return normalized;
}

function normalizeTodoItems(items: unknown): TodoResultItem[] | null {
  if (!Array.isArray(items)) return null;
  const normalized: TodoResultItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "number") return null;
    if (typeof record.title !== "string") return null;
    if (!isTodoStatus(record.status)) return null;
    normalized.push({
      id: record.id,
      title: record.title,
      status: record.status,
    });
  }
  return normalized;
}

export function extractTodoResultItems(
  toolName: string | null | undefined,
  data: unknown,
  args?: unknown,
): TodoResultItem[] | null {
  const normalizedToolName = normalizeTodoToolName(toolName);
  if (data && typeof data === "object" && "items" in data) {
    const items = normalizeTodoItems((data as { items?: unknown }).items);
    if (items) return items;
  }

  if (normalizedToolName === "todo" && args && typeof args === "object" && "todoList" in args) {
    return normalizeTodoItems((args as { todoList?: unknown }).todoList);
  }

  if (normalizedToolName === "todo" && args && typeof args === "object" && "todos" in args) {
    const rawTodos = (args as { todos?: unknown }).todos;
    if (!Array.isArray(rawTodos)) return null;
    const mapped = rawTodos.map((item, index) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const rawStatus = String(record.status ?? "pending");
      const status: TodoResultItem["status"] =
        rawStatus === "completed" ? "completed"
          : rawStatus === "in_progress" || rawStatus === "in-progress" ? "in-progress"
            : "not-started";
      return {
        id: typeof record.id === "number" ? record.id : index,
        title: String(record.content ?? record.title ?? ""),
        status,
      };
    });
    return normalizeTodoItems(mapped);
  }

  return null;
}
