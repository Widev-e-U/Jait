import { AlertTriangle, FolderOpen } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'

import { Conversation, Message, PromptInput, Suggestions, TodoList, MessageQueue, FilesChanged } from '@/components/chat'
import { ContextIndicator } from '@/components/chat/context-indicator'
import {
  shouldShowChatContextIndicator,
  shouldShowNormalChatComposer,
} from '@/components/chat/message-edit-layout'
import { GitDiffIndicator } from '@/components/chat/git-diff-indicator'
import { PlanReview } from '@/components/chat/plan-review'
import { ConsentQueue } from '@/components/consent'
import { TrajectoryPanel } from '@/components/debug/trajectory-panel'
import { ErrorBoundary } from '@/components/error-boundary'
import { Button } from '@/components/ui/button'
import type { ContextUsage } from '@/hooks/useChat'
import { haveRenderInputsChanged } from '@/lib/message-element-cache'
import type { SessionReasoningEffort } from '@/lib/session-chat-selection'
import { getProjectRepositoryId } from '@/lib/project-repositories'

// Below this chat-panel width the floating top indicators (git-diff pill on the
// left, context-window donut on the right) sit on top of transcript text, so
// both are hidden entirely (display: none) instead of overlapping the text.
const FLOATING_CHAT_INDICATORS_MIN_WIDTH = 480

interface DeveloperChatWorkspaceProps {
  activeProject: any
  activeProjectId: string | null
  activeProjectDisplayName: string | null
  activeProjectRoot: string | null
  activeSessionId: string | null
  availableFilesForMention: any[]
  availableSkills: any[]
  changedFiles: any[]
  changedFilesForComposer: any[]
  chatCollapsed: boolean
  chatMode: any
  chatProvider: any
  chatProviderRuntimeMode: any
  chatResponseStyle: any
  showDebugPanel: boolean
  onCloseDebugPanel: () => void
  cliModel: string | null
  reasoningEffort: SessionReasoningEffort | null
  contextUsage: ContextUsage | null
  developerChatPanelStyle: CSSProperties
  developerChatSubmitLoading: boolean
  developerChatUiState: { showTodoList: boolean }
  developerComposerControlRow: ReactNode
  developerPlaceholder: string
  editComposerBag: any
  error: string | null
  hasMessages: boolean
  inlinePrompts?: ReactNode
  hasMoreMessages: boolean
  hitMaxRounds: boolean
  inputSegments: any[] | undefined
  inputValueRef: RefObject<string>
  inputVersion: number
  isLoading: boolean
  isLoadingHistory: boolean
  isMobile: boolean
  loadOlderMessages: () => void
  limitReached: boolean
  managerThreads: any[]
  messageContents: string[]
  messageQueue: any[]
  messages: any[]
  pendingPlan: any
  previewOpen: boolean
  promptBeforeProcessingQueuedMessage: boolean
  projectNodeId?: string | null
  projectSuggestions: any[]
  projects: any[]
  projectsLoading: boolean
  promptInputRef: RefObject<any>
  sendTarget: any
  sessionInfo: any
  setChatPanelElement: (node: HTMLDivElement | null) => void
  showDesktopProject: boolean
  showProject: boolean
  showScreenShare: boolean
  suggestions: any[]
  threadTargetRepoRuntime: any
  token: string | null
  todoList: any[]
  voiceLevels: number[]
  voiceRecording: boolean
  voiceTranscribing: boolean
  onAcceptAllFiles: () => void
  onAcceptFile: (file: any) => void
  onCancelRequest: () => void
  onChangedFileClick: (file: any) => void
  onChatModeChange: (mode: any) => void
  onClearTodoList: () => void
  onCliModelChange: (model: string | null) => void
  onReasoningEffortChange: (reasoningEffort: SessionReasoningEffort | null) => void
  onContinueChat: (options: { token: string | null; sessionId: string | null }) => void
  onDequeueMessage: (id: string) => void
  onEditPreviousMessage: (...args: any[]) => void
  onExecutePlan: () => void
  onHandleInputChange: (value: string) => void
  onHandleMemoryFeedback: (...args: any[]) => void
  onHandleSuggestion: (suggestion: string) => void
  onMemorySourceOpen: (source: any) => void
  onMoveRepoToGateway?: (...args: any[]) => void
  onOpenAddProject: () => void
  onOpenMessagePath: (path: string) => void
  onOpenSourceControl: () => void
  onOpenTerminalFromToolCall: (...args: any[]) => void
  onApprovalResponse: (requestId: string, approved: boolean) => Promise<void> | void
  onAskQueuedMessageInParallel: (id: string) => void
  onProviderChange: (provider: any) => void
  onProviderRuntimeModeChange: (mode: any) => void
  onQueue: () => void
  onRejectAllFiles: () => void
  onRejectFile: (file: any) => void
  onRejectPlan: () => void
  onReorderQueueItem: (...args: any[]) => void
  onResponseStyleChange: (style: any) => void
  onSearchFiles: (query: string, limit: number, signal?: AbortSignal) => Promise<any[]>
  onSendTargetChange: (target: any) => void
  onSendQueuedAfterInterruptedExit: () => void
  onSetApproveAllInSession: (enabled: boolean) => void
  onSteerQueuedMessage?: (id: string) => void
  onStopRecording: () => void
  onSubmit: () => void
  onToggleHoldQueueItem: (id: string) => void
  onUpdateQueueItem: (...args: any[]) => void
  onVoiceInput: () => void
  renderInlineSecretPrompt: (call: any) => ReactNode
}

export function DeveloperChatWorkspace({
  activeProject,
  activeProjectId,
  activeProjectDisplayName,
  activeProjectRoot,
  activeSessionId,
  availableFilesForMention,
  availableSkills,
  changedFiles,
  changedFilesForComposer,
  chatCollapsed,
  chatMode,
  chatProvider,
  chatProviderRuntimeMode,
  chatResponseStyle,
  showDebugPanel,
  onCloseDebugPanel,
  cliModel,
  reasoningEffort,
  contextUsage,
  developerChatPanelStyle,
  developerChatSubmitLoading,
  developerChatUiState,
  developerComposerControlRow,
  developerPlaceholder,
  editComposerBag,
  error,
  hasMessages,
  hasMoreMessages,
  hitMaxRounds,
  inputSegments,
  inputValueRef,
  inputVersion,
  inlinePrompts,
  isLoading,
  isLoadingHistory,
  isMobile,
  loadOlderMessages,
  limitReached,
  managerThreads,
  messageContents,
  messageQueue,
  messages,
  pendingPlan,
  previewOpen,
  promptBeforeProcessingQueuedMessage,
  projectNodeId,
  projectSuggestions,
  projects,
  projectsLoading,
  promptInputRef,
  sendTarget,
  sessionInfo,
  setChatPanelElement,
  showDesktopProject,
  showProject,
  showScreenShare,
  suggestions,
  threadTargetRepoRuntime,
  token,
  todoList,
  voiceLevels,
  voiceRecording,
  voiceTranscribing,
  onAcceptAllFiles,
  onAcceptFile,
  onCancelRequest,
  onChangedFileClick,
  onChatModeChange,
  onClearTodoList,
  onCliModelChange,
  onReasoningEffortChange,
  onContinueChat,
  onDequeueMessage,
  onEditPreviousMessage,
  onExecutePlan,
  onHandleInputChange,
  onHandleMemoryFeedback,
  onHandleSuggestion,
  onMemorySourceOpen,
  onMoveRepoToGateway,
  onOpenAddProject,
  onOpenMessagePath,
  onOpenSourceControl,
  onOpenTerminalFromToolCall,
  onApprovalResponse,
  onAskQueuedMessageInParallel,
  onProviderChange,
  onProviderRuntimeModeChange,
  onQueue,
  onRejectAllFiles,
  onRejectFile,
  onRejectPlan,
  onReorderQueueItem,
  onResponseStyleChange,
  onSearchFiles,
  onSendTargetChange,
  onSendQueuedAfterInterruptedExit,
  onSetApproveAllInSession,
  onSteerQueuedMessage,
  onStopRecording,
  onSubmit,
  onToggleHoldQueueItem,
  onUpdateQueueItem,
  onVoiceInput,
  renderInlineSecretPrompt,
}: DeveloperChatWorkspaceProps) {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [consentPresent, setConsentPresent] = useState(false)
  // Width of the chat panel, used to hide the floating top indicators when the
  // panel gets too narrow (they would overlap transcript text otherwise).
  const [chatPanelWidth, setChatPanelWidth] = useState(0)
  const chatPanelRef = useRef<HTMLDivElement | null>(null)
  const attachChatPanelElement = useCallback(
    (node: HTMLDivElement | null) => {
      chatPanelRef.current = node
      setChatPanelElement(node)
    },
    [setChatPanelElement],
  )
  useEffect(() => {
    const el = chatPanelRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth
      setChatPanelWidth((prev) => (prev === width ? prev : width))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  // 0 = not measured yet; treat as visible so indicators don't flash hidden.
  const showFloatingChatIndicators =
    chatPanelWidth === 0 || chatPanelWidth >= FLOATING_CHAT_INDICATORS_MIN_WIDTH
  const handleMessageEditingChange = useCallback((messageId: string, editing: boolean) => {
    setEditingMessageId((current) => editing ? messageId : current === messageId ? null : current)
  }, [])
  const showNormalComposer = shouldShowNormalChatComposer(isMobile, editingMessageId)

  useEffect(() => {
    setEditingMessageId(null)
  }, [activeSessionId])

  // These hooks must stay above the empty-chat return. A chat commonly renders
  // once without messages while history loads and then renders with messages;
  // placing transcript-only hooks below that return changes the hook count on
  // that transition and makes React abort the entire application.
  const elementCacheRef = useRef<Map<string, {
    element: ReactNode
    renderInputs: readonly unknown[]
  }>>(new Map())
  const sharedRenderInputsRef = useRef<readonly unknown[] | undefined>(undefined)
  const sharedRenderVersionRef = useRef(0)
  const cacheSessionRef = useRef<string | null>(null)
  const scrollToUserMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].id
    }
    return null
  }, [messages])
  const activeProjectHasRepo = useMemo(
    () => {
      if (!activeProjectId) return false
      const record = projects.find((project) => project.id === activeProjectId) ?? null
      return getProjectRepositoryId(record) != null
    },
    [projects, activeProjectId],
  )

  if (cacheSessionRef.current !== activeSessionId) {
    elementCacheRef.current.clear()
    cacheSessionRef.current = activeSessionId
  }

  if (!hasMessages) {
    return (
      <div
        ref={setChatPanelElement}
        className={`relative flex-1 min-w-0 flex flex-col items-center justify-center overflow-hidden ${chatCollapsed ? '' : 'px-4'} ${isMobile ? 'pt-12' : ''}`}
        style={developerChatPanelStyle}
      >
        <div className="w-full max-w-4xl space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight">Jait</h1>
            <p className="text-base text-muted-foreground mt-1">Just Another Intelligent Tool</p>
          </div>
          {!projectsLoading && projects.length === 0 ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">Add a project folder to start chatting with your code.</p>
              <Button variant="default" size="lg" onClick={onOpenAddProject}>
                <FolderOpen className="h-4 w-4 mr-2" />
                Add Project
              </Button>
            </div>
          ) : (
            <Suggestions suggestions={showProject && activeProject ? projectSuggestions : suggestions} onSelect={onHandleSuggestion} />
          )}
          <div className="overflow-hidden rounded-2xl border bg-background dark:bg-card focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
            {developerChatUiState.showTodoList && (
              <TodoList items={todoList} onClear={onClearTodoList} merged />
            )}
            {inlinePrompts}
            <ErrorBoundary name="Chat composer" variant="section" resetKeys={[activeSessionId, inputVersion, sendTarget]}>
              <PromptInput
                ref={promptInputRef}
                availableSkills={availableSkills}
                draftStateKey={`developer:${activeSessionId ?? 'new-chat'}`}
                value={inputValueRef.current}
                syncKey={inputVersion}
                segments={inputSegments}
                onChange={onHandleInputChange}
                onSubmit={onSubmit}
                onStop={onCancelRequest}
                onQueue={onQueue}
                isLoading={isLoading}
                submitLoading={developerChatSubmitLoading}
                placeholder={developerPlaceholder}
                onVoiceInput={onVoiceInput}
                voiceRecording={voiceRecording}
                voiceLevels={voiceLevels}
                voiceTranscribing={voiceTranscribing}
                onVoiceStop={onStopRecording}
                mode={chatMode}
                onModeChange={onChatModeChange}
                responseStyle={chatResponseStyle}
                onResponseStyleChange={onResponseStyleChange}
                sendTarget={sendTarget}
                onSendTargetChange={onSendTargetChange}
                showSendTargetSelector={false}
                provider={chatProvider}
                onProviderChange={onProviderChange}
                providerRuntimeMode={chatProviderRuntimeMode}
                onProviderRuntimeModeChange={onProviderRuntimeModeChange}
                cliModel={cliModel}
                onCliModelChange={onCliModelChange}
                reasoningEffort={reasoningEffort}
                onReasoningEffortChange={onReasoningEffortChange}
                repoRuntime={sendTarget === 'thread' ? threadTargetRepoRuntime : null}
                onMoveToGateway={sendTarget === 'thread' ? onMoveRepoToGateway : undefined}
                availableFiles={availableFilesForMention}
                onSearchFiles={onSearchFiles}
                projectOpen={Boolean(activeProjectRoot)}
                projectName={activeProjectDisplayName ?? undefined}
                projectPath={activeProjectRoot ?? undefined}
                chatId={activeSessionId ?? undefined}
                sessionInfo={sessionInfo}
                projectNodeId={projectNodeId ?? undefined}
                projectId={activeProjectId}
                merged
                mergedShowTopDivider={developerChatUiState.showTodoList || Boolean(inlinePrompts)}
              />
            </ErrorBoundary>
          </div>
          {developerComposerControlRow}
        </div>
      </div>
    )
  }

  // ── Memoized message elements ─────────────────────────────────────────
  // During streaming the chat hook produces a brand-new `messages` array on
  // every token flush. A plain `messages.map(...)` would allocate a fresh
  // <Message> element for *every* message each frame, and React must reconcile
  // all of them. In long conversations this per-token O(N) work grows
  // linearly and is the main source of lag as the flow goes on.
  //
  // We cache one element per message id, keyed on the render-relevant inputs
  // for that message plus the shared props that affect every message. When
  // only the streaming message changes, every other message reuses its
  // cached element object, so React skips it entirely — no allocation, no
  // memo comparison, no reconciliation. The cache is cleared whenever the
  // active session changes (so we never serve stale elements for a new chat).
  const sharedRenderInputs = [
    chatProvider,
    token,
    showProject || showScreenShare || previewOpen,
    managerThreads,
    onOpenTerminalFromToolCall,
    renderInlineSecretPrompt,
    onApprovalResponse,
    onEditPreviousMessage,
    handleMessageEditingChange,
    editComposerBag,
    onOpenMessagePath,
    onChangedFileClick,
    onMemorySourceOpen,
    onHandleMemoryFeedback,
  ]
  if (haveRenderInputsChanged(sharedRenderInputsRef.current, sharedRenderInputs)) {
    sharedRenderInputsRef.current = sharedRenderInputs
    sharedRenderVersionRef.current += 1
  }
  const lastMsgId = messages.length > 0 ? messages[messages.length - 1].id : null
  const messageElements: ReactNode[] = []
  {
    const cache = elementCacheRef.current
    for (let idx = 0; idx < messages.length; idx++) {
      const msg = messages[idx]
      const isStreaming = isLoading && msg.id === lastMsgId
      const cached = cache.get(msg.id)
      const renderInputs = [
        sharedRenderVersionRef.current,
        idx,
        messages.length - 1 - idx,
        msg.role,
        msg.kind,
        msg.content,
        msg.steered,
        msg.contextFlow,
        msg.hasContextFlow,
        msg.hasMemoryProvenance,
        msg.displayContent,
        msg.referencedFiles,
        msg.displaySegments,
        msg.attachments,
        msg.thinking,
        msg.thinkingDuration,
        msg.toolCalls,
        msg.segments,
        isStreaming,
        editingMessageId === msg.id,
      ]
      if (cached && !haveRenderInputsChanged(cached.renderInputs, renderInputs)) {
        messageElements.push(cached.element)
        continue
      }
      const element = (
        <Message
          key={msg.id}
          messageId={msg.id}
          messageIndex={idx}
          messageFromEnd={messages.length - 1 - idx}
          role={msg.role}
          kind={msg.kind}
          content={msg.content}
          steered={msg.steered}
          contextFlow={msg.contextFlow}
          hasContextFlow={msg.hasContextFlow}
          hasMemoryProvenance={msg.hasMemoryProvenance}
          sessionId={activeSessionId}
          authToken={token}
          displayContent={msg.displayContent}
          referencedFiles={msg.referencedFiles}
          displaySegments={msg.displaySegments}
          attachments={msg.attachments}
          thinking={msg.thinking}
          thinkingDuration={msg.thinkingDuration}
          toolCalls={msg.toolCalls}
          segments={msg.segments}
          isStreaming={isStreaming}
          compact={showProject || showScreenShare || previewOpen}
          preferLlmUi
          provider={chatProvider}
          threadControlThreads={managerThreads as unknown as Record<string, unknown>[]}
          onOpenTerminal={onOpenTerminalFromToolCall}
          renderInlineSecretPrompt={renderInlineSecretPrompt}
          onApprovalResponse={onApprovalResponse}
          onEditMessage={onEditPreviousMessage}
          editing={editingMessageId === msg.id}
          onEditingChange={handleMessageEditingChange}
          editComposer={editComposerBag}
          onOpenPath={onOpenMessagePath}
          onOpenDiff={onChangedFileClick}
          onOpenMemorySource={onMemorySourceOpen}
          onMemoryFeedback={onHandleMemoryFeedback}
        />
      )
      cache.set(msg.id, {
        element,
        renderInputs,
      })
      messageElements.push(element)
    }
    // Drop cache entries for messages that no longer exist (e.g. after clear/reload)
    if (cache.size > messages.length) {
      const live = new Set(messages.map((m) => m.id))
      for (const id of cache.keys()) if (!live.has(id)) cache.delete(id)
    }
  }

  const isProjectChat = Boolean(activeProjectId || activeProjectRoot)

  return (
    <div
      ref={attachChatPanelElement}
      className="relative flex flex-col min-h-0 min-w-0 overflow-hidden"
      style={developerChatPanelStyle}
    >
      {!chatCollapsed && (
        <>
          {!showDebugPanel && isProjectChat && activeProjectHasRepo && (
            <div className={`absolute top-2 left-2 z-10 ${showFloatingChatIndicators ? '' : 'hidden'}`}>
              <GitDiffIndicator
                projectRoot={activeProjectRoot}
                nodeId={activeProject?.nodeId}
                fileCount={changedFiles.length}
                onOpen={onOpenSourceControl}
                compact={isMobile}
              />
            </div>
          )}
          {shouldShowChatContextIndicator(Boolean(contextUsage), showDebugPanel) && contextUsage && (
            // On desktop the conversation shows the minimap scrollbar (96px) flush to
            // the right edge, and the jump-to-previous-user-message button sits just left
            // of that; offset the indicator clear of both, not under them.
            <div className={`absolute top-2 z-10 ${isMobile ? 'right-2' : 'right-[156px]'} ${showFloatingChatIndicators ? '' : 'hidden'}`}>
              <ContextIndicator usage={contextUsage} messages={messages} compact={isMobile} />
            </div>
          )}
          {showDebugPanel ? (
            // Trajectory/debug mode replaces only the transcript — the composer
            // and its controls stay, and auto-scroll keeps matching the chat.
            <ErrorBoundary name="Trajectory panel" variant="section" className="min-h-0 flex-1 border-b" resetKeys={[activeSessionId, messages.length, showDebugPanel]}>
              <TrajectoryPanel onClose={onCloseDebugPanel} sessionId={activeSessionId} token={token} />
            </ErrorBoundary>
          ) : (
            <ErrorBoundary name="Chat transcript" variant="section" className="min-h-0 flex-1 border-b" resetKeys={[activeSessionId, messages.length, messageQueue.length, showDesktopProject]}>
              <Conversation
                key={activeSessionId ?? 'developer-empty'}
                className="min-h-0 flex-1 border-b"
                compact={showDesktopProject}
                loading={isLoadingHistory}
                loadingLabel="Loading chat"
                messageContents={messageContents}
                messageEstimateInputs={messages}
                hasMore={hasMoreMessages}
                onLoadMore={loadOlderMessages}
                scrollToMessageId={scrollToUserMessageId}
                showMinimap={!isMobile}
              >
                {messageElements}
                {messageQueue.length > 0 && (
                  <MessageQueue
                    items={messageQueue}
                    onRemove={onDequeueMessage}
                    onEdit={onUpdateQueueItem}
                    onReorder={onReorderQueueItem}
                    onSteer={isLoading && activeSessionId ? onSteerQueuedMessage : undefined}
                    onSendToParallelThread={onAskQueuedMessageInParallel}
                    parallelActionLabel="Ask in parallel"
                    onToggleHold={onToggleHoldQueueItem}
                  />
                )}
              </Conversation>
            </ErrorBoundary>
          )}

          {showNormalComposer && (
            <div className={`shrink-0 ${isMobile ? 'px-2 py-2' : `py-3 ${showDesktopProject ? 'px-3' : 'px-4'}`}`}>
            <div className="mx-auto w-full max-w-4xl space-y-1.5">
              {error && error !== 'login_required' && error !== 'limit_reached' && !isLoading && (
                <div className="flex items-center gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400 dark:text-red-400 dark:border-red-400/40 dark:bg-red-400/10">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">{error}</span>
                </div>
              )}
              {hitMaxRounds && !isLoading && (
                <div className="flex flex-wrap items-center justify-center gap-2 py-1.5">
                  <button
                    onClick={() => onContinueChat({ token, sessionId: activeSessionId })}
                    className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    Continue
                  </button>
                  {promptBeforeProcessingQueuedMessage && (
                    <button
                      onClick={onSendQueuedAfterInterruptedExit}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
                    >
                      Send queued
                    </button>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {promptBeforeProcessingQueuedMessage
                      ? 'Agent paused at its safety budget — continue or send the queued message'
                      : 'Agent paused at its safety budget — continue to resume'}
                  </span>
                </div>
              )}
              {pendingPlan && (
                <PlanReview plan={pendingPlan} onApprove={onExecutePlan} onReject={onRejectPlan} isExecuting={isLoading} />
              )}
              {limitReached && (
                <p className="text-center text-sm text-destructive">Daily limit reached. Come back tomorrow.</p>
              )}
              <div className="overflow-hidden rounded-2xl border bg-background dark:bg-card focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
                <div className="max-h-[40vh] overflow-y-auto divide-y divide-border">
                  {developerChatUiState.showTodoList && (
                    <TodoList items={todoList} onClear={onClearTodoList} merged />
                  )}
                  {changedFiles.length > 0 && (
                    <FilesChanged
                      files={changedFilesForComposer}
                      onAccept={onAcceptFile}
                      onReject={onRejectFile}
                      onAcceptAll={onAcceptAllFiles}
                      onRejectAll={onRejectAllFiles}
                      onFileClick={onChangedFileClick}
                      merged
                    />
                  )}
                  <ConsentQueue compact merged sessionId={activeSessionId} onApproveAllEnabled={() => onSetApproveAllInSession(true)} onVisibleChange={setConsentPresent} />
                  {inlinePrompts}
                </div>
                {(() => {
                  const hasItemsAboveComposer = developerChatUiState.showTodoList || changedFiles.length > 0 || Boolean(inlinePrompts) || consentPresent
                  return (
                <ErrorBoundary name="Chat composer" variant="section" resetKeys={[activeSessionId, inputVersion, sendTarget]}>
                  <PromptInput
                    ref={promptInputRef}
                    availableSkills={availableSkills}
                    draftStateKey={`developer:${activeSessionId ?? 'new-chat'}`}
                    value={inputValueRef.current}
                    syncKey={inputVersion}
                    segments={inputSegments}
                    onChange={onHandleInputChange}
                    onSubmit={onSubmit}
                    onStop={onCancelRequest}
                    onQueue={onQueue}
                    isLoading={isLoading}
                    submitLoading={developerChatSubmitLoading}
                    disabled={limitReached}
                    placeholder={developerPlaceholder}
                    onVoiceInput={onVoiceInput}
                    voiceRecording={voiceRecording}
                    voiceLevels={voiceLevels}
                    voiceTranscribing={voiceTranscribing}
                    onVoiceStop={onStopRecording}
                    mode={chatMode}
                    onModeChange={onChatModeChange}
                    responseStyle={chatResponseStyle}
                    onResponseStyleChange={onResponseStyleChange}
                    sendTarget={sendTarget}
                    onSendTargetChange={onSendTargetChange}
                    showSendTargetSelector={false}
                    provider={chatProvider}
                    onProviderChange={onProviderChange}
                    providerRuntimeMode={chatProviderRuntimeMode}
                    onProviderRuntimeModeChange={onProviderRuntimeModeChange}
                    cliModel={cliModel}
                    onCliModelChange={onCliModelChange}
                    reasoningEffort={reasoningEffort}
                    onReasoningEffortChange={onReasoningEffortChange}
                    repoRuntime={sendTarget === 'thread' ? threadTargetRepoRuntime : null}
                    onMoveToGateway={sendTarget === 'thread' ? onMoveRepoToGateway : undefined}
                    availableFiles={availableFilesForMention}
                    onSearchFiles={onSearchFiles}
                    projectOpen={Boolean(activeProjectRoot)}
                    projectName={activeProjectDisplayName ?? undefined}
                    projectPath={activeProjectRoot ?? undefined}
                    chatId={activeSessionId ?? undefined}
                    sessionInfo={sessionInfo}
                    projectNodeId={projectNodeId ?? undefined}
                    projectId={activeProjectId}
                    merged
                    mergedShowTopDivider={hasItemsAboveComposer}
                  />
                </ErrorBoundary>
                  )
                })()}
              </div>
              {developerComposerControlRow}
            </div>
          </div>
          )}
        </>
      )}
    </div>
  )
}
