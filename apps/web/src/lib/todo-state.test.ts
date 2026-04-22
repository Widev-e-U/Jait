import { describe, expect, it } from 'vitest'

import { mergeHydratedTodoState, normalizeTodoStateValue, toPersistedTodoState } from './todo-state'

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
  it('keeps a streamed todo list when a stale hydrate payload is empty', () => {
    expect(mergeHydratedTodoState([
      { id: 1, title: 'Trace bug', status: 'in-progress' },
    ], null)).toEqual([
      { id: 1, title: 'Trace bug', status: 'in-progress' },
    ])
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
