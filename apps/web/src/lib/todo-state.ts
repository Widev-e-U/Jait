import type { TodoItem } from '@/components/chat/todo-list'

interface TodoToolCallLike {
  tool?: unknown
  args?: unknown
  result?: unknown
  data?: unknown
}

interface TodoMessageLike {
  toolCalls?: unknown
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function isTodoToolName(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'todo'
    || normalized === 'todowrite'
    || normalized.endsWith('__todo')
    || normalized.endsWith('.todo')
    || normalized.endsWith('manage_todo_list')
}

function normalizeTodoStatus(value: unknown): TodoItem['status'] {
  const normalized = typeof value === 'string'
    ? value.trim().toLowerCase().replace(/_/g, '-')
    : ''
  if (normalized === 'completed' || normalized === 'done') return 'completed'
  if (normalized === 'in-progress' || normalized === 'running' || normalized === 'active') return 'in-progress'
  return 'not-started'
}

function normalizeTodoItems(value: unknown): TodoItem[] | null {
  if (!Array.isArray(value)) return null
  const items: TodoItem[] = []
  value.forEach((entry, index) => {
    const record = toRecord(entry)
    if (!record) return
    const rawTitle = record.title ?? record.content ?? record.step ?? record.task
    if (typeof rawTitle !== 'string' || !rawTitle.trim()) return
    items.push({
      id: typeof record.id === 'number' ? record.id : index + 1,
      title: rawTitle,
      status: normalizeTodoStatus(record.status),
    })
  })
  return items
}

function todoItemsFromToolCall(call: TodoToolCallLike): TodoItem[] | null {
  if (!isTodoToolName(call.tool)) return null
  const args = toRecord(call.args)
  const result = toRecord(call.result)
  const resultData = toRecord(result?.data)
  const directData = toRecord(call.data)
  const todoListRecord = toRecord(args?.todoList)

  return normalizeTodoItems(args?.todoList)
    ?? normalizeTodoItems(todoListRecord?.items)
    ?? normalizeTodoItems(args?.todos)
    ?? normalizeTodoItems(resultData?.items)
    ?? normalizeTodoItems(directData?.items)
}

export function normalizeTodoStateValue(value: unknown): TodoItem[] {
  return Array.isArray(value) ? value as TodoItem[] : []
}

/**
 * Rebuild the latest todo state embedded in chat tool calls. Running snapshots
 * can arrive before the separate session-state channel, so the tool call is the
 * only authoritative state available immediately after a reload.
 */
export function recoverTodoListFromMessages(messages: TodoMessageLike[]): TodoItem[] | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const toolCalls = messages[messageIndex]?.toolCalls
    if (!Array.isArray(toolCalls)) continue
    for (let callIndex = toolCalls.length - 1; callIndex >= 0; callIndex -= 1) {
      const call = toRecord(toolCalls[callIndex])
      if (!call) continue
      const items = todoItemsFromToolCall(call)
      if (items !== null) return items
    }
  }
  return null
}

export function mergeHydratedTodoState(
  current: TodoItem[],
  incoming: unknown,
  preserveRecoveredRunningState = false,
): TodoItem[] {
  if (preserveRecoveredRunningState && current.length > 0 && !Array.isArray(incoming)) {
    return current
  }
  // Todos are session-bound: the incoming persisted state is authoritative.
  // Returning `current` when incoming is empty would leak the previous
  // session's todos into a newly-selected chat that has none.
  return normalizeTodoStateValue(incoming)
}

export function toPersistedTodoState(items: TodoItem[]): TodoItem[] | null {
  return items.length > 0 ? items : null
}
