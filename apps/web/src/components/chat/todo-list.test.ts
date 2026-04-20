import { describe, expect, it } from 'vitest'
import { areAllTodoItemsCompleted, getActiveTodoItem, getCollapsedTodoDisplay, type TodoItem } from './todo-list'

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

describe('getCollapsedTodoDisplay', () => {
  it('puts the active task and spinner in the collapsed header', () => {
    expect(getCollapsedTodoDisplay([
      { id: 1, title: 'Map existing architecture', status: 'completed' },
      { id: 2, title: 'Patch collapsed task row', status: 'in-progress' },
      { id: 3, title: 'Verify UI behavior', status: 'not-started' },
    ])).toEqual({
      headerLabel: 'Patch collapsed task row',
      showHeaderSpinner: true,
      showCompletedSummary: false,
    })
  })

  it('uses the completed summary only when every task is complete', () => {
    expect(getCollapsedTodoDisplay([
      { id: 1, title: 'Map existing architecture', status: 'completed' },
      { id: 2, title: 'Patch collapsed task row', status: 'completed' },
      { id: 3, title: 'Verify UI behavior', status: 'completed' },
    ])).toEqual({
      headerLabel: 'Tasks',
      showHeaderSpinner: false,
      showCompletedSummary: true,
    })
  })
})
