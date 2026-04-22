import type { TodoItem } from '@/components/chat/todo-list'

export function normalizeTodoStateValue(value: unknown): TodoItem[] {
  return Array.isArray(value) ? value as TodoItem[] : []
}

export function mergeHydratedTodoState(current: TodoItem[], incoming: unknown): TodoItem[] {
  const normalizedIncoming = normalizeTodoStateValue(incoming)
  if (current.length > 0 && normalizedIncoming.length === 0) return current
  return normalizedIncoming
}

export function toPersistedTodoState(items: TodoItem[]): TodoItem[] | null {
  return items.length > 0 ? items : null
}
