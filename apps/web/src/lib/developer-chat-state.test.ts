import { describe, expect, it } from 'vitest'

import { getDeveloperChatSubmitLoading, getDeveloperChatUiState } from './developer-chat-state'

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

describe('getDeveloperChatSubmitLoading', () => {
  const readyInput = {
    viewMode: 'developer',
    currentView: 'chat',
    requiresAuthGate: false,
    authLoading: false,
    workspacesLoading: false,
    activeSessionId: 'session-1',
    isLoadingHistory: false,
    loadingChatMode: false,
    loadingProviderRuntimeMode: false,
    loadingCliModels: false,
    loadingChatView: false,
  }

  it('shows submit loading while chat history is loading for an active session', () => {
    expect(getDeveloperChatSubmitLoading({
      ...readyInput,
      isLoadingHistory: true,
    })).toBe(true)
  })

  it('shows submit loading while initial workspace state is loading', () => {
    expect(getDeveloperChatSubmitLoading({
      ...readyInput,
      activeSessionId: null,
      workspacesLoading: true,
    })).toBe(true)
  })

  it('does not block submit for unrelated views', () => {
    expect(getDeveloperChatSubmitLoading({
      ...readyInput,
      viewMode: 'manager',
      isLoadingHistory: true,
    })).toBe(false)
  })
})
