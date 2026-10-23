import { useRef, useState, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '@/hooks/useAuth'
import { DeveloperChatWorkspace } from '@/components/app-shell/developer-chat-workspace'
import type { PromptInputHandle } from '@/components/chat/prompt-input'
import type { QueuedMessage } from '@/components/chat/message-queue'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import '@/index.css'

const noop = () => {}
function Harness() {
  const isMobile = window.innerWidth < 768
  const retryMode = new URLSearchParams(window.location.search).get('retry')
  const providerError = 'The model provider is experiencing issues (502). Please try again later.'
  const [retryLoading, setRetryLoading] = useState(false)
  const [retryCompleted, setRetryCompleted] = useState(false)
  const [retryCalls, setRetryCalls] = useState<string[]>([])
  const retryResolveRef = useRef<(() => void) | null>(null)
  const finishRetry = (success: boolean) => {
    setRetryCompleted(success)
    setRetryLoading(false)
    retryResolveRef.current?.()
    retryResolveRef.current = null
  }
  const fixtureMessages = retryMode ? [
    { id: 'older-error', role: 'assistant', content: '', segments: [{ type: 'error', content: providerError }] },
    { id: 'user-request', role: 'user', content: 'Investigate the issue' },
    { id: 'latest-error', role: 'assistant', content: '', segments: retryMode === 'footer' ? [] : [{ type: 'error', content: providerError }] },
    ...(retryCompleted ? [{ id: 'success', role: 'assistant', content: 'Continued successfully' }] : []),
  ] : [{ id: 'assistant-1', role: 'assistant', content: 'Queue editing conversation' }]
  const inputValueRef = useRef('Keep my unsent draft')
  const promptRef = useRef<PromptInputHandle>(null)
  const [items, setItems] = useState<QueuedMessage[]>([{ id: 'queued-1', content: 'Edit this queued message', queuedAt: 1, held: true }])
  const props: ComponentProps<typeof DeveloperChatWorkspace> = {
    activeProject: null,
    activeProjectId: null,
    activeProjectDisplayName: null,
    activeProjectRoot: null,
    activeSessionId: 'queue-edit-fixture',
    availableFilesForMention: [],
    availableSkills: [],
    changedFiles: [],
    changedFilesForComposer: [],
    chatCollapsed: false,
    chatMode: 'build',
    chatProvider: 'jait',
    chatProviderRuntimeMode: 'supervised',
    chatResponseStyle: 'normal',
    showDebugPanel: false,
    onCloseDebugPanel: noop,
    cliModel: null,
    reasoningEffort: null,
    contextUsage: null,
    defaultStreamingAction: 'queue',
    developerChatPanelStyle: { height: '100dvh', width: '100%' },
    developerChatSubmitLoading: false,
    developerChatUiState: { showTodoList: false },
    developerComposerControlRow: <span data-testid="normal-composer-controls">Normal composer</span>,
    developerPlaceholder: 'Normal composer draft',
    editComposerBag: {},
    error: retryMode && !retryCompleted ? providerError : null,
    hasMessages: true,
    hasMoreMessages: false,
    hitMaxRounds: false,
    inputSegments: undefined,
    inputValueRef: inputValueRef,
    inputVersion: 0,
    isLoading: retryLoading,
    isLoadingHistory: false,
    isMobile: isMobile,
    loadOlderMessages: noop,
    limitReached: false,
    managerThreads: [],
    messageContents: fixtureMessages.map(message => message.content),
    messageQueue: retryMode ? [] : items,
    messages: fixtureMessages,
    pendingPlan: null,
    previewOpen: false,
    promptBeforeProcessingQueuedMessage: false,
    projectSuggestions: [],
    projects: [],
    projectsLoading: false,
    promptInputRef: promptRef,
    sendTarget: 'chat',
    sessionInfo: null,
    setChatPanelElement: noop,
    showDesktopProject: false,
    showProject: false,
    showScreenShare: false,
    showPanelHideButton: false,
    suggestions: [],
    threadTargetRepoRuntime: null,
    token: retryMode ? 'fixture-token' : null,
    todoList: [],
    voiceLevels: [],
    voiceRecording: false,
    voiceTranscribing: false,
    onAcceptAllFiles: noop,
    onAcceptFile: noop,
    onCancelRequest: noop,
    onChangedFileClick: noop,
    onChatModeChange: noop,
    onClearTodoList: noop,
    onCliModelChange: noop,
    onReasoningEffortChange: noop,
    onContinueChat: retryMode ? (options) => {
      setRetryCalls(calls => [...calls, JSON.stringify(options)])
      setRetryLoading(true)
      return new Promise<void>(resolve => { retryResolveRef.current = resolve })
    } : noop,
    onDequeueMessage: id => setItems(items => items.filter(item => item.id !== id)),
    onEditPreviousMessage: noop,
    onExecutePlan: noop,
    onHandleInputChange: value => { inputValueRef.current = value },
    onHandleMemoryFeedback: noop,
    onHandleSuggestion: noop,
    onMemorySourceOpen: noop,
    onOpenAddProject: noop,
    onOpenMessagePath: noop,
    onOpenSourceControl: noop,
    onOpenTerminalFromToolCall: noop,
    onHidePanel: noop,
    onApprovalResponse: noop,
    onAskQueuedMessageInParallel: noop,
    onProviderChange: noop,
    onProviderRuntimeModeChange: noop,
    onQueue: noop,
    onSteer: noop,
    onRejectAllFiles: noop,
    onRejectFile: noop,
    onRejectPlan: noop,
    onReorderQueueItem: noop,
    onResponseStyleChange: noop,
    onSearchFiles: async () => [],
    onSendTargetChange: noop,
    onSendQueuedAfterInterruptedExit: noop,
    onSetApproveAllInSession: noop,
    onStopRecording: noop,
    onSubmit: noop,
    onToggleHoldQueueItem: noop,
    onUpdateQueueItem: (id, content, attachments, displaySegments) => setItems(items => items.map(item => item.id === id ? { ...item, content, attachments, displaySegments } : item)),
    onVoiceInput: noop,
  }
  return <TooltipProvider><ConfirmDialogProvider>
    <button className="fixed left-2 top-2 z-[80]" onClick={() => setItems([])}>Remove queued item externally</button>
    {retryMode && <div className="fixed right-2 top-2 z-[80] flex gap-2 bg-background">
      <output data-testid="retry-calls">{JSON.stringify(retryCalls)}</output>
      <button onClick={() => finishRetry(true)}>Complete retry</button>
      <button onClick={() => finishRetry(false)}>Fail retry</button>
    </div>}
    <DeveloperChatWorkspace {...props} />
  </ConfirmDialogProvider></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<AuthProvider><Harness /></AuthProvider>)
