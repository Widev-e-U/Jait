import { describe, expect, it } from 'vitest'
import { areAllTodoItemsCompleted, getActiveTodoItem, type TodoItem } from './todo-list'

describe('getActiveTodoItem', () => {
  it('returns the in-progress item when present', () => {
    const items: TodoItem[] = [
      { id: 1, title: 'Read files', status: 'completed' },
      { id: 2, title: 'Patch route', status: 'in-progress' },
      { id: 3, title: 'Run tests', status: 'not-started' },
    ]

    expect(getActiveTodoItem(items)?.title).toBe('Patch route')
  })

  it('returns null when no item is in progress', () => {
    const items: TodoItem[] = [
      { id: 1, title: 'Read files', status: 'completed' },
      { id: 2, title: 'Run tests', status: 'not-started' },
    ]

    expect(getActiveTodoItem(items)).toBeNull()
  })
})

describe('areAllTodoItemsCompleted', () => {
  it('returns true only when every item is completed', () => {
    expect(areAllTodoItemsCompleted([
      { id: 1, title: 'Read files', status: 'completed' },
      { id: 2, title: 'Patch route', status: 'completed' },
    ])).toBe(true)

    expect(areAllTodoItemsCompleted([
      { id: 1, title: 'Read files', status: 'completed' },
      { id: 2, title: 'Patch route', status: 'in-progress' },
    ])).toBe(false)
  })

  it('returns false for an empty list', () => {
    expect(areAllTodoItemsCompleted([])).toBe(false)
  })
})
