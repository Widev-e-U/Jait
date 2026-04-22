import type { TodoItem } from '@/components/chat/todo-list'

export function normalizeTodoStateValue(value: unknown): TodoItem[] {
  return Array.isArray(value) ? value as TodoItem[] : []
}

export function toPersistedTodoState(items: TodoItem[]): TodoItem[] | null {
  return items.length > 0 ? items : null
}
