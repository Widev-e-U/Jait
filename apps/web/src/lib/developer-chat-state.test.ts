import { describe, expect, it } from 'vitest'

import { getDeveloperChatUiState } from './developer-chat-state'

describe('getDeveloperChatUiState', () => {
  it('keeps the thread target switch enabled during active agent streaming', () => {
    expect(getDeveloperChatUiState({
      developerChatHydrating: false,
      isLoadingHistory: false,
      todoCount: 0,
    })).toMatchObject({
      disableSendTargetSelector: false,
    })
  })

  it('disables the send target switch while chat history is hydrating', () => {
    expect(getDeveloperChatUiState({
      developerChatHydrating: true,
      isLoadingHistory: true,
      todoCount: 0,
    })).toMatchObject({
      disableSendTargetSelector: true,
    })
  })

  it('shows the developer todo list even before the first assistant message renders', () => {
    expect(getDeveloperChatUiState({
      developerChatHydrating: false,
      isLoadingHistory: false,
      todoCount: 3,
    })).toMatchObject({
      showTodoList: true,
    })
  })

  it('hides the developer todo list while the chat shell is still hydrating', () => {
    expect(getDeveloperChatUiState({
      developerChatHydrating: true,
      isLoadingHistory: true,
      todoCount: 2,
    })).toMatchObject({
      showTodoList: false,
    })
  })
})
