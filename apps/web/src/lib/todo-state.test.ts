import { describe, expect, it } from 'vitest'

import { mergeHydratedTodoState, normalizeTodoStateValue, recoverTodoListFromMessages, toPersistedTodoState } from './todo-state'

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

  it('preserves snapshot-recovered todos when empty full state races a running reload', () => {
    const recovered = [{ id: 1, title: 'Recovered task', status: 'in-progress' as const }]

    expect(mergeHydratedTodoState(recovered, null, true)).toBe(recovered)
    expect(mergeHydratedTodoState(recovered, undefined, true)).toBe(recovered)
  })
})

describe('recoverTodoListFromMessages', () => {
  it('rehydrates the latest todo tool call from a running chat snapshot', () => {
    expect(recoverTodoListFromMessages([
      {
        toolCalls: [{
          tool: 'mcp__jait_core.todo',
          args: {
            todoList: [
              { id: 1, title: 'Trace reload', status: 'completed' },
              { id: 2, title: 'Repair hydration', status: 'in-progress' },
            ],
          },
        }],
      },
    ])).toEqual([
      { id: 1, title: 'Trace reload', status: 'completed' },
      { id: 2, title: 'Repair hydration', status: 'in-progress' },
    ])
  })

  it('uses the newest todo call and supports provider-native todos', () => {
    expect(recoverTodoListFromMessages([
      {
        toolCalls: [{
          tool: 'todo',
          args: { todoList: [{ id: 1, title: 'Old task', status: 'in-progress' }] },
        }],
      },
      {
        toolCalls: [{
          tool: 'TodoWrite',
          args: {
            todos: [
              { content: 'New task', status: 'in_progress' },
              { content: 'Done task', status: 'completed' },
            ],
          },
        }],
      },
    ])).toEqual([
      { id: 1, title: 'New task', status: 'in-progress' },
      { id: 2, title: 'Done task', status: 'completed' },
    ])
  })
})
