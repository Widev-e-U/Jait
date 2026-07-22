import { describe, expect, it } from 'vitest'

import { applyTodoLifecycle, mergeHydratedTodoState, normalizeTodoStateValue, toPersistedTodoState } from './todo-state'

describe('applyTodoLifecycle', () => {
  const unfinished = [
    { id: 1, title: 'Implement feature', status: 'in-progress' as const },
    { id: 2, title: 'Run tests', status: 'not-started' as const },
  ]

  it('preserves unfinished todos when a turn starts or completes', () => {
    expect(applyTodoLifecycle(unfinished, 'turn-start')).toBe(unfinished)
    expect(applyTodoLifecycle(unfinished, 'turn-complete')).toBe(unfinished)
  })

  it('clears unfinished todos only when the session itself is cleared', () => {
    expect(applyTodoLifecycle(unfinished, 'session-clear')).toEqual([])
  })

  it('keeps a completed list visible until the next turn starts', () => {
    const completed = unfinished.map((item) => ({ ...item, status: 'completed' as const }))
    expect(applyTodoLifecycle(completed, 'turn-complete')).toBe(completed)
    expect(applyTodoLifecycle(completed, 'turn-start')).toEqual([])
  })
})

describe('normalizeTodoStateValue', () => {
  it('returns items when the persisted value is a todo array', () => {
    expect(normalizeTodoStateValue([
      { id: 1, title: 'Trace bug', status: 'in-progress' },
    ])).toEqual([
      { id: 1, title: 'Trace bug', status: 'in-progress' },
    ])
  })

  it('returns an empty array for null or missing state', () => {
    expect(normalizeTodoStateValue(null)).toEqual([])
    expect(normalizeTodoStateValue(undefined)).toEqual([])
  })
})

describe('toPersistedTodoState', () => {
  it('stores non-empty todo lists and removes empty ones', () => {
    expect(toPersistedTodoState([
      { id: 1, title: 'Patch UI', status: 'completed' },
    ])).toEqual([
      { id: 1, title: 'Patch UI', status: 'completed' },
    ])

    expect(toPersistedTodoState([])).toBeNull()
  })
})

describe('mergeHydratedTodoState', () => {
  it('clears todos when the hydrate payload is empty (session-bound, no leak)', () => {
    expect(mergeHydratedTodoState([
      { id: 1, title: 'Trace bug', status: 'in-progress' },
    ], null)).toEqual([])
    expect(mergeHydratedTodoState([
      { id: 1, title: 'Trace bug', status: 'in-progress' },
    ], undefined)).toEqual([])
  })

  it('applies hydrated todos when they are present', () => {
    expect(mergeHydratedTodoState([
      { id: 1, title: 'Trace bug', status: 'in-progress' },
    ], [
      { id: 2, title: 'Patch bug', status: 'not-started' },
    ])).toEqual([
      { id: 2, title: 'Patch bug', status: 'not-started' },
    ])
  })
})
