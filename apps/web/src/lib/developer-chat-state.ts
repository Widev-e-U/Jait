export interface DeveloperChatUiStateInput {
  developerChatHydrating: boolean
  isLoadingHistory: boolean
  todoCount: number
}

export interface DeveloperChatSubmitLoadingInput {
  viewMode: string
  currentView: string
  requiresAuthGate: boolean
  authLoading: boolean
  projectsLoading: boolean
  activeSessionId: string | null | undefined
  isLoadingHistory: boolean
  loadingChatMode: boolean
  loadingProviderRuntimeMode: boolean
  loadingCliModels: boolean
  loadingChatView: boolean
}

export interface DeveloperChatUiState {
  disableSendTargetSelector: boolean
  showTodoList: boolean
}

export function shouldShowDeveloperChatHistoryLoading(input: {
  isLoadingHistory: boolean
  sessionCreatedAt?: string | null
  sessionLastActiveAt?: string | null
}): boolean {
  if (!input.isLoadingHistory) return false

  const pristineSession = Boolean(
    input.sessionCreatedAt
    && input.sessionLastActiveAt
    && input.sessionCreatedAt === input.sessionLastActiveAt,
  )
  return !pristineSession
}

export function getDeveloperChatUiState(input: DeveloperChatUiStateInput): DeveloperChatUiState {
  return {
    disableSendTargetSelector: input.isLoadingHistory,
    showTodoList: !input.developerChatHydrating && input.todoCount > 0,
  }
}

export function getDeveloperChatSubmitLoading(input: DeveloperChatSubmitLoadingInput): boolean {
  if (input.viewMode !== 'developer' || input.currentView !== 'chat' || input.requiresAuthGate) {
    return false
  }

  if (input.authLoading || input.projectsLoading) return true
  if (!input.activeSessionId) return false

  // Only genuine conversation hydration should disable the composer. Per-session
  // UI preference fetches (mode / provider runtime mode / CLI models / view) all
  // have safe defaults, and a slow or stalled one of those must never leave the
  // send button stuck as a disabled spinner after a response has fully streamed.
  return input.isLoadingHistory
}
