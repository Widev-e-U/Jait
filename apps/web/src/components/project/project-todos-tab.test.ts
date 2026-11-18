import { describe, expect, it } from 'vitest'

import {
  canDetachTab,
  closeTodosTab,
  hasTodosTab,
  TODOS_TAB_ID,
  TODOS_TAB_PATH,
  upsertTodosTab,
  type EditorTabLike,
} from './project-todos-tab'

interface Tab extends EditorTabLike {
  label?: string
}

const file = (id: string): Tab => ({ id, type: 'file', label: id })
const todos = (): Tab => ({ id: TODOS_TAB_ID, type: 'todos', label: 'Todos' })

describe('project todos tab helpers', () => {
  it('detects an open todos tab', () => {
    expect(hasTodosTab([file('a.ts')])).toBe(false)
    expect(hasTodosTab([file('a.ts'), todos()])).toBe(true)
  })

  it('appends the todos tab once and then refreshes it in place', () => {
    const opened = upsertTodosTab([file('a.ts')], todos())
    expect(opened.map((tab) => tab.id)).toEqual(['a.ts', TODOS_TAB_ID])

    const refreshed = upsertTodosTab(opened, { ...todos(), label: 'Todos (2)' })
    expect(refreshed).toHaveLength(2)
    expect(refreshed[1]).toEqual({ id: TODOS_TAB_ID, type: 'todos', label: 'Todos (2)' })
  })

  it('keeps the previous array identity when reopening an identical tab list', () => {
    const tabs = [file('a.ts'), todos()]
    const refreshed = upsertTodosTab(tabs, { ...todos() } as Tab)
    expect(refreshed).not.toBe(tabs)
    expect(refreshed).toHaveLength(2)
  })

  it('closes the todos tab and activates the neighbor at the same index', () => {
    const result = closeTodosTab([file('a.ts'), todos(), file('b.ts')], TODOS_TAB_ID)
    expect(result.tabs.map((tab) => tab.id)).toEqual(['a.ts', 'b.ts'])
    expect(result.wasActive).toBe(true)
    expect(result.neighbor?.id).toBe('b.ts')
    expect(result.activeTabId).toBe('b.ts')
  })

  it('falls back to the new last tab when the todos tab was last', () => {
    const result = closeTodosTab([file('a.ts'), file('b.ts'), todos()], TODOS_TAB_ID)
    expect(result.neighbor?.id).toBe('b.ts')
    expect(result.activeTabId).toBe('b.ts')
  })

  it('clears the active tab when only todos was open', () => {
    const result = closeTodosTab([todos()], TODOS_TAB_ID)
    expect(result.tabs).toEqual([])
    expect(result.wasActive).toBe(true)
    expect(result.neighbor).toBeNull()
    expect(result.activeTabId).toBeNull()
  })

  it('leaves the active tab untouched when closing a background todos tab', () => {
    const result = closeTodosTab([file('a.ts'), todos()], 'a.ts')
    expect(result.wasActive).toBe(false)
    expect(result.neighbor).toBeNull()
    expect(result.activeTabId).toBe('a.ts')
    expect(result.tabs.map((tab) => tab.id)).toEqual(['a.ts'])
  })

  it('is a no-op when no todos tab is open', () => {
    const tabs = [file('a.ts')]
    const result = closeTodosTab(tabs, 'a.ts')
    expect(result.wasActive).toBe(false)
    expect(result.activeTabId).toBe('a.ts')
    expect(result.tabs.map((tab) => tab.id)).toEqual(['a.ts'])
  })

  it('never detaches preview or todos tabs', () => {
    expect(canDetachTab('file')).toBe(true)
    expect(canDetachTab('architecture')).toBe(true)
    expect(canDetachTab('diff')).toBe(true)
    expect(canDetachTab('preview')).toBe(false)
    expect(canDetachTab('todos')).toBe(false)
  })

  it('exposes a sentinel path for routing the editor pane', () => {
    expect(TODOS_TAB_PATH).toBe('__todos__')
    expect(TODOS_TAB_ID).toBe('todos')
  })
})
