import { describe, expect, it } from 'vitest'

import {
  getDeveloperChatSubmitLoading,
  getDeveloperChatUiState,
  shouldShowDeveloperChatHistoryLoading,
} from './developer-chat-state'

describe('shouldShowDeveloperChatHistoryLoading', () => {
  it('hides the history loader for a pristine newly-created chat', () => {
    expect(shouldShowDeveloperChatHistoryLoading({
      isLoadingHistory: true,
      sessionCreatedAt: '2026-08-27T12:00:00.000Z',
      sessionLastActiveAt: '2026-08-27T12:00:00.000Z',
    })).toBe(false)
  })

  it('keeps the history loader for chats with prior activity', () => {
    expect(shouldShowDeveloperChatHistoryLoading({
      isLoadingHistory: true,
      sessionCreatedAt: '2026-08-27T12:00:00.000Z',
      sessionLastActiveAt: '2026-08-27T12:05:00.000Z',
    })).toBe(true)
  })

  it('stays conservative when session metadata is not hydrated yet', () => {
    expect(shouldShowDeveloperChatHistoryLoading({
      isLoadingHistory: true,
    })).toBe(true)
  })
})

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
    projectsLoading: false,
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

  it('shows submit loading while initial project state is loading', () => {
    expect(getDeveloperChatSubmitLoading({
      ...readyInput,
      activeSessionId: null,
      projectsLoading: true,
    })).toBe(true)
  })

  it('does not block submit while only per-session preferences are still loading', () => {
    // Regression: after a response streamed, a slow provider-runtime-mode / CLI
    // model fetch must not leave the send button stuck as a disabled spinner.
    expect(getDeveloperChatSubmitLoading({
      ...readyInput,
      loadingChatMode: true,
      loadingProviderRuntimeMode: true,
      loadingCliModels: true,
      loadingChatView: true,
    })).toBe(false)
  })

  it('does not block submit for unrelated views', () => {
    expect(getDeveloperChatSubmitLoading({
      ...readyInput,
      viewMode: 'manager',
      isLoadingHistory: true,
    })).toBe(false)
  })
})
