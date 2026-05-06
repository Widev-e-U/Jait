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
  workspacesLoading: boolean
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

  if (input.authLoading || input.workspacesLoading) return true
  if (!input.activeSessionId) return false

  return (
    input.isLoadingHistory
    || input.loadingChatMode
    || input.loadingProviderRuntimeMode
    || input.loadingCliModels
    || input.loadingChatView
  )
}
