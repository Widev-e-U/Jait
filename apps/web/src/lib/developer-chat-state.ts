export interface DeveloperChatUiStateInput {
  developerChatHydrating: boolean
  isLoadingHistory: boolean
  todoCount: number
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
