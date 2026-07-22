import type { TodoItem } from '@/components/chat/todo-list'

export type TodoLifecycleEvent = 'turn-start' | 'turn-complete' | 'session-clear'

export function applyTodoLifecycle(items: TodoItem[], event: TodoLifecycleEvent): TodoItem[] {
  if (event === 'session-clear') return []
  if (event === 'turn-start' && items.length > 0 && items.every((item) => item.status === 'completed')) return []
  return items
}

export function normalizeTodoStateValue(value: unknown): TodoItem[] {
  return Array.isArray(value) ? value as TodoItem[] : []
}

export function mergeHydratedTodoState(_current: TodoItem[], incoming: unknown): TodoItem[] {
  // Todos are session-bound: the incoming persisted state is authoritative.
  // Returning `current` when incoming is empty would leak the previous
  // session's todos into a newly-selected chat that has none.
  return normalizeTodoStateValue(incoming)
}

export function toPersistedTodoState(items: TodoItem[]): TodoItem[] | null {
  return items.length > 0 ? items : null
}
