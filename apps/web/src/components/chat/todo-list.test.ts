import { describe, expect, it } from 'vitest'
import { areAllTodoItemsCompleted, getActiveTodoItems, getCollapsedTodoDisplay, type TodoItem } from './todo-list'

describe('getActiveTodoItems', () => {
  it('returns all in-progress items', () => {
    const items: TodoItem[] = [
      { id: 1, title: 'Research A', status: 'in-progress' },
      { id: 2, title: 'Research B', status: 'in-progress' },
      { id: 3, title: 'Run tests', status: 'not-started' },
    ]

    expect(getActiveTodoItems(items).map((t) => t.title)).toEqual(['Research A', 'Research B'])
  })

  it('returns an empty array when no item is in progress', () => {
    const items: TodoItem[] = [
      { id: 1, title: 'Read files', status: 'completed' },
      { id: 2, title: 'Run tests', status: 'not-started' },
    ]

    expect(getActiveTodoItems(items)).toEqual([])
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
      showHeaderCompleted: false,
    })
  })

  it('shows a count when multiple items are in progress', () => {
    expect(getCollapsedTodoDisplay([
      { id: 1, title: 'Research VSCode Copilot repos agent', status: 'in-progress' },
      { id: 2, title: 'Research OpenClaw (latest)', status: 'in-progress' },
      { id: 3, title: 'Verify UI behavior', status: 'not-started' },
    ])).toEqual({
      headerLabel: '2 tasks in progress',
      showHeaderSpinner: true,
      showHeaderCompleted: false,
    })
  })

  it('uses the completed header state only when every task is complete', () => {
    expect(getCollapsedTodoDisplay([
      { id: 1, title: 'Map existing architecture', status: 'completed' },
      { id: 2, title: 'Patch collapsed task row', status: 'completed' },
      { id: 3, title: 'Verify UI behavior', status: 'completed' },
    ])).toEqual({
      headerLabel: 'All tasks completed',
      showHeaderSpinner: false,
      showHeaderCompleted: true,
    })
  })
})
