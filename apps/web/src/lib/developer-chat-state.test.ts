import { describe, expect, it } from 'vitest'

import { getDeveloperChatUiState } from './developer-chat-state'

describe('getDeveloperChatUiState', () => {
  it('shows the todo list once hydration finishes and todos exist', () => {
    expect(getDeveloperChatUiState({
      developerChatHydrating: false,
      isLoadingHistory: false,
      todoCount: 2,
    })).toEqual({
      disableSendTargetSelector: false,
      showTodoList: true,
    })
  })

  it('keeps the todo list hidden during hydration', () => {
    expect(getDeveloperChatUiState({
      developerChatHydrating: true,
      isLoadingHistory: false,
      todoCount: 2,
    }).showTodoList).toBe(false)
  })
})
