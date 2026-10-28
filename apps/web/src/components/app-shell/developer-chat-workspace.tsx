import { readChatLoop } from '@jait/shared'
import { ChatLoopGoal } from '@/components/chat/loop-goal-card'
import { AlertTriangle, FolderOpen, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'

import {
  Conversation,
  Message,
  PromptInput,
  Suggestions,
  TodoList,
  MessageQueue,
  FilesChanged,
  getChatTranscriptColumnLeft,
  shouldShowFloatingLeftIndicator,
} from '@/components/chat'
import { ContextIndicator } from '@/components/chat/context-indicator'
import {
  getChatColumnClassName,
  getChatComposerBoundaryClassName,
  getChatTranscriptBoundaryClassName,
  shouldShowChatContextIndicator,
  shouldShowNormalChatComposer,
} from '@/components/chat/message-edit-layout'
import {
  clampRevealDeltaToHeader,
  getComposerRevealDelta,
  getKeyboardBottomInset,
  getNewChatColumnClassName,
  getNewChatStackClassName,
  getVisibleViewportBottom,
  shouldPlaceControlRowAboveComposer,
} from '@/components/chat/new-chat-composer-layout'
import { GitDiffIndicator } from '@/components/chat/git-diff-indicator'
import { PlanReview } from '@/components/chat/plan-review'
import { ConsentQueue } from '@/components/consent'
import { TrajectoryPanel } from '@/components/debug/trajectory-panel'
import { ErrorBoundary } from '@/components/error-boundary'
import { Button } from '@/components/ui/button'
import { TooltipHint } from '@/components/ui/tooltip'
import type { ContextUsage } from '@/hooks/useChat'
import type { DefaultStreamingAction } from '@/lib/prompt-submit-routing'
import { haveRenderInputsChanged } from '@/lib/message-element-cache'
import type { SessionReasoningEffort } from '@/lib/session-chat-selection'
import { getProjectRepositoryId } from '@/lib/project-repositories'

// Below this chat-panel width the floating context-window indicator (top-right)
// sits on top of transcript text, so it is hidden entirely (display: none)
// instead of overlapping the text. The git-diff pill (top-left) instead hides
// based on a measured collision with the transcript text column.
const FLOATING_CHAT_INDICATORS_MIN_WIDTH = 480
// Left inset (`left-2`) of the floating git-diff pill inside the chat panel.
const GIT_DIFF_INDICATOR_LEFT_INSET_PX = 8

interface DeveloperChatWorkspaceProps {
  newChatContext?: ReactNode
  activeProject: any
  activeProjectId: string | null
  activeProjectDisplayName: string | null
  activeProjectRoot: string | null
  onLatestContentViewed?: () => void
  sessionMetadata?: string | null
  activeSessionId: string | null
  availableFilesForMention: any[]
  availableSkills: any[]
  changedFiles: any[]
  changedFilesForComposer: any[]
  chatCollapsed: boolean
  chatMode: any
  chatPanelWidth?: number | null
  chatProvider: any
  chatProviderRuntimeMode: any
  chatResponseStyle: any
  showDebugPanel: boolean
  onCloseDebugPanel: () => void
  cliModel: string | null
  reasoningEffort: SessionReasoningEffort | null
  contextUsage: ContextUsage | null
  defaultStreamingAction: DefaultStreamingAction
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
  showPanelHideButton: boolean
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
  onContinueChat: (options: { token: string | null; sessionId: string | null }) => Promise<unknown> | void
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
  /** Opens the source-control panel. Triggered by the git-diff pill. */
  onOpenSourceControl: () => void
  onOpenTerminalFromToolCall: (...args: any[]) => void
  onHidePanel: () => void
  onApprovalResponse: (requestId: string, approved: boolean) => Promise<void> | void
  onAskQueuedMessageInParallel: (id: string) => void
  onProviderChange: (provider: any) => void
  onProviderRuntimeModeChange: (mode: any) => void
  onQueue: () => void
  /** Steer the running agent with the currently typed composer content. */
  onSteer: () => void
  /** Fork the running session and ask the typed composer content as a parallel question. */
  onAskInParallel?: () => void
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
  onStopAndSteerQueuedMessage?: (id: string) => void
  onStopRecording: () => void
  onSubmit: () => void
  onToggleHoldQueueItem: (id: string) => void
  onUpdateQueueItem: (...args: any[]) => void
  onVoiceInput: () => void
  renderInlineSecretPrompt?: (call: any) => ReactNode
}

export function DeveloperChatWorkspace({
  newChatContext,
  activeProject,
  activeProjectId,
  activeProjectDisplayName,
  activeProjectRoot,
  onLatestContentViewed,
  sessionMetadata,
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
  defaultStreamingAction,
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
  chatPanelWidth: measuredChatPanelWidth,
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
  showPanelHideButton,
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
  onHidePanel,
  onApprovalResponse,
  onAskQueuedMessageInParallel,
  onProviderChange,
  onProviderRuntimeModeChange,
  onQueue,
  onSteer,
  onAskInParallel,
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
  onStopAndSteerQueuedMessage,
  onStopRecording,
  onSubmit,
  onToggleHoldQueueItem,
  onUpdateQueueItem,
  onVoiceInput,
  renderInlineSecretPrompt,
}: DeveloperChatWorkspaceProps) {
  const [isContinuing, setIsContinuing] = useState(false)
  const continuationPendingRef = useRef(false)
  const handleErrorRetry = useCallback(async () => {
    if (!activeSessionId || isLoading || isLoadingHistory || limitReached || continuationPendingRef.current) return
    continuationPendingRef.current = true
    setIsContinuing(true)
    try {
      await onContinueChat({ token, sessionId: activeSessionId })
    } finally {
      continuationPendingRef.current = false
      setIsContinuing(false)
    }
  }, [activeSessionId, isLoading, isLoadingHistory, limitReached, onContinueChat, token])
  const retryDisabled = isLoading || isLoadingHistory || limitReached || isContinuing
  const latestMessage = messages.at(-1)
  const latestMessageHasError = latestMessage?.role === 'assistant'
    && Array.isArray(latestMessage.segments) && latestMessage.segments.at(-1)?.type === 'error'

  const [editingQueue, setEditingQueue] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  // Width of the chat panel, used to hide the floating top indicators when the
  // panel gets too narrow (they would overlap transcript text otherwise).
  // Measured by the App-level `useChatPanelMeasure` hook and handed down via
  // `setChatPanelElement` (attached to the panel root below). That hook
  // re-measures whenever the root node changes, so this stays correct even
  // though the panel swaps between an empty-state div and the transcript layout
  // and remounts across sessions.
  const chatPanelWidth = measuredChatPanelWidth ?? 0
  // 0 = not measured yet; treat as visible so indicators don't flash hidden.
  const showFloatingChatIndicators =
    chatPanelWidth === 0 || chatPanelWidth >= FLOATING_CHAT_INDICATORS_MIN_WIDTH
  // The floating git-diff pill hides as soon as its right edge would come
  // within a small gap of the transcript text column (instead of sitting on
  // top of the text), measured against the actual rendered pill width.
  const [gitDiffIndicatorElement, setGitDiffIndicatorElement] = useState<HTMLDivElement | null>(null)
  const [gitDiffIndicatorWidth, setGitDiffIndicatorWidth] = useState(0)
  const attachGitDiffIndicator = useCallback((node: HTMLDivElement | null) => {
    setGitDiffIndicatorElement(node)
    if (node && node.offsetWidth > 0) setGitDiffIndicatorWidth(node.offsetWidth)
  }, [])
  useEffect(() => {
    const el = gitDiffIndicatorElement
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      // display:none collapses the pill to 0 — keep the last measured width so
      // the collision check stays stable across show/hide toggles.
      if (width > 0) setGitDiffIndicatorWidth((prev) => (prev === width ? prev : width))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [gitDiffIndicatorElement])
  // ── Mobile new-chat composer visibility ────────────────────────────────
  // The empty state is one centered column. On a phone the soft keyboard
  // shrinks the viewport below the column height, which used to clip the
  // composer behind the mobile nav bar. The column scrolls on mobile and we
  // nudge it up by exactly the hidden amount so the input stays fully usable.
  const newChatScrollRef = useRef<HTMLDivElement | null>(null)
  const newChatStackRef = useRef<HTMLDivElement | null>(null)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const setNewChatScrollElement = useCallback(
    (node: HTMLDivElement | null) => {
      newChatScrollRef.current = node
      setChatPanelElement(node)
    },
    [setChatPanelElement],
  )
  useEffect(() => {
    if (!isMobile) {
      setKeyboardInset(0)
      return
    }
    const viewport = window.visualViewport
    if (!viewport) return
    // iOS keeps the layout viewport at full height while the keyboard is open,
    // so nothing inside the column resizes and the reveal observer would never
    // fire. The covered height therefore both triggers the reveal and reserves
    // a scroll band at the bottom of the column; the reveal itself measures the
    // visible band from the visual viewport so the keyboard is subtracted once.
    const update = () => {
      const next = getKeyboardBottomInset(window.innerHeight, viewport)
      setKeyboardInset((prev) => (prev === next ? prev : next))
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [isMobile])
  useEffect(() => {
    if (!isMobile || hasMessages) return
    const scroller = newChatScrollRef.current
    const stack = newChatStackRef.current
    if (!scroller || !stack) return
    const revealComposer = () => {
      const scrollerRect = scroller.getBoundingClientRect()
      // Only the part of the column above the keyboard is usable. Measuring the
      // band from `visualViewport` (instead of from the column and the keyboard
      // inset separately) keeps the nudge exact on both platforms: the column
      // has already shrunk where the layout viewport resizes, and on iOS the
      // visual viewport is the only thing that knows the keyboard is up.
      const visibleBottom = Math.min(
        scrollerRect.bottom,
        getVisibleViewportBottom(window.visualViewport, window.innerHeight),
      )
      const rawDelta = getComposerRevealDelta(
        stack.getBoundingClientRect().bottom,
        scrollerRect.top,
        visibleBottom - scrollerRect.top,
      )
      // The nudge scrolls content up, so it must never tuck the composer under
      // the header: cap it at the room that keeps the composer top clear.
      const composer = stack.querySelector<HTMLElement>('[data-testid="chat-composer"]')
      const composerTop = composer ? composer.getBoundingClientRect().top : stack.getBoundingClientRect().top
      const header = document.querySelector('header, [role="banner"]')
      const headerBottom = header ? header.getBoundingClientRect().bottom : scrollerRect.top
      const delta = clampRevealDeltaToHeader(rawDelta, composerTop, headerBottom)
      if (delta > 0) scroller.scrollTop += delta
    }
    revealComposer()
    if (typeof ResizeObserver === 'undefined') return
    // Re-check whenever the viewport shrinks (keyboard) or the composer grows.
    const observer = new ResizeObserver(revealComposer)
    observer.observe(scroller)
    observer.observe(stack)
    return () => observer.disconnect()
  }, [isMobile, hasMessages, keyboardInset])
  const showGitDiffIndicator =
    chatPanelWidth === 0 ||
    gitDiffIndicatorWidth === 0 ||
    shouldShowFloatingLeftIndicator({
      indicatorRight: GIT_DIFF_INDICATOR_LEFT_INSET_PX + gitDiffIndicatorWidth,
      contentLeft: getChatTranscriptColumnLeft(chatPanelWidth, isMobile),
    })
  const handleMessageEditingChange = useCallback((messageId: string, editing: boolean) => {
    setEditingMessageId((current) => editing ? messageId : current === messageId ? null : current)
  }, [])
  // Clicking the previous-user-message chip in the Conversation scrolls there
  // and hands us the child index; open that user message's editor.
  const handleEditPreviousUserMessage = useCallback((childIndex: number) => {
    const message = messages[childIndex]
    if (message?.role !== 'user') return
    setEditingMessageId(message.id)
  }, [messages])
  const showNormalComposer = shouldShowNormalChatComposer(isMobile, editingMessageId, editingQueue)
  const panelHideButton = showPanelHideButton ? (
    <TooltipHint content="Hide chat panel">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 z-20 h-8 w-8 bg-background/80 backdrop-blur-sm"
        onClick={onHidePanel}
        aria-label="Hide chat panel"
      >
        <X className="h-4 w-4" />
      </Button>
    </TooltipHint>
  ) : null

  useEffect(() => {
    setEditingMessageId(null)
  }, [activeSessionId])

  // An edit-and-resend replaces the edited row with a locally rendered user
  // turn whose id the old row never owned, so its unmount cannot release edit
  // ownership. Without this, `editingMessageId` would keep pointing at a gone
  // message and the mobile composer would stay hidden after the resend.
  useEffect(() => {
    if (!editingMessageId) return
    if (messages.some((message) => message.id === editingMessageId)) return
    setEditingMessageId(null)
  }, [editingMessageId, messages])

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
      if (messages[i].role === 'user') return messages[i].renderId ?? messages[i].id
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

  // With the mobile soft keyboard open the composer card must be the stack's
  // bottom element so the reveal can dock it just above the keyboard; the
  // control row moves above it for as long as the keyboard is up.
  const controlRowAboveComposer = shouldPlaceControlRowAboveComposer(isMobile, keyboardInset)

  if (!hasMessages) {
    return (
      <div
        ref={setNewChatScrollElement}
        className={getNewChatColumnClassName(isMobile, !chatCollapsed)}
        // Reserve the covered band so the column can scroll far enough, while
        // the reveal below measures the *visible* band so the keyboard is only
        // subtracted once. Padding alone lifted the composer under the header.
        style={keyboardInset > 0 ? { ...developerChatPanelStyle, paddingBottom: keyboardInset } : developerChatPanelStyle}
      >
        {panelHideButton}
        <div ref={newChatStackRef} className={getNewChatStackClassName(isMobile)}>
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight">Jait</h1>
            <p className="text-base text-muted-foreground mt-1">Just Another Intelligent Tool</p>
          </div>
          {newChatContext}
          {!newChatContext && !projectsLoading && projects.length === 0 ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">Add a project folder to start chatting with your code.</p>
              <Button variant="default" size="lg" onClick={onOpenAddProject}>
                <FolderOpen className="h-4 w-4 mr-2" />
                Add Project
              </Button>
            </div>
          ) : (
            <Suggestions suggestions={activeProjectId ? projectSuggestions : suggestions} onSelect={onHandleSuggestion} />
          )}
          <div className="space-y-1.5">
            {developerChatUiState.showTodoList && (
              <TodoList items={todoList} onClear={onClearTodoList} merged />
            )}
            {inlinePrompts}
            {controlRowAboveComposer && developerComposerControlRow}
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
                defaultStreamingAction={defaultStreamingAction}
                onQueue={onQueue}
                onSteer={onSteer}
                onAskInParallel={onAskInParallel}
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
              />
            </ErrorBoundary>
            {!controlRowAboveComposer && developerComposerControlRow}
          </div>
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
      const onTryContinue = msg.id === lastMsgId && latestMessageHasError && activeSessionId
        ? handleErrorRetry : undefined
      const isMessageContinuing = Boolean(onTryContinue && retryDisabled)
      const cached = cache.get(msg.id)
      const renderInputs = [
        sharedRenderVersionRef.current,
        idx,
        messages.length - 1 - idx,
        msg.renderId,
        msg.role,
        msg.kind,
        msg.persona,
        msg.content,
        msg.steered,
        msg.sendState,
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
        onTryContinue,
        isMessageContinuing,
        editingMessageId === msg.id,
      ]
      if (cached && !haveRenderInputsChanged(cached.renderInputs, renderInputs)) {
        messageElements.push(cached.element)
        continue
      }
      const element = (
        <Message
          key={msg.renderId ?? msg.id}
          messageId={msg.id}
          messageIndex={idx}
          messageFromEnd={messages.length - 1 - idx}
          role={msg.role}
          kind={msg.kind}
          persona={msg.persona}
          content={msg.content}
          steered={msg.steered}
          sendState={msg.sendState}
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
          onTryContinue={onTryContinue}
          isContinuing={isMessageContinuing}
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

  const loop = readChatLoop(sessionMetadata)
  const useNarrowGoalLayout = !isMobile && getChatTranscriptColumnLeft(chatPanelWidth, false) >= 232
  const isProjectChat = Boolean(activeProjectId || activeProjectRoot)

  return (
    <div
      ref={setChatPanelElement}
      data-browser-chat-scope
      className="relative flex flex-col min-h-0 min-w-0 overflow-hidden"
      style={developerChatPanelStyle}
    >
      {panelHideButton}
      {!chatCollapsed && (
        <>
          {!showDebugPanel && isProjectChat && activeProjectHasRepo && (
            <div ref={attachGitDiffIndicator} className={`absolute top-2 left-2 z-10 ${showGitDiffIndicator ? '' : 'hidden'}`}>
              <GitDiffIndicator
                projectRoot={activeProjectRoot}
                nodeId={activeProject?.nodeId}
                onOpen={onOpenSourceControl}
                compact={isMobile}
              />
            </div>
          )}
          {!showDebugPanel && loop && activeSessionId && (
            // Align wide-screen goals with the chat column so long cards can cover the composer.
            <div data-testid="chat-goal-overlay" className={`pointer-events-none absolute z-40 flex flex-col items-start bg-transparent ${useNarrowGoalLayout ? 'top-12 left-[max(0.5rem,calc((100%_-_56rem)/2))] w-52 max-h-[calc(100%-64px)]' : 'top-2 left-4 right-4 max-h-[calc(100%-16px)]'}`}>
              <ChatLoopGoal loop={loop} sessionId={activeSessionId} token={token} mobile={isMobile} />
            </div>
          )}
          {shouldShowChatContextIndicator(Boolean(contextUsage), showDebugPanel) && contextUsage && (
            // On desktop the conversation shows the minimap scrollbar (96px) flush to
            // the right edge, and the previous-user-message chip hangs just below the
            // indicator at the same inset; keep the indicator above it, not under.
            <div className={`absolute top-2 z-10 ${isMobile ? 'right-2' : 'right-[156px]'} ${showFloatingChatIndicators ? '' : 'hidden'}`}>
              <ContextIndicator usage={contextUsage} messages={messages} compact={isMobile} />
            </div>
          )}
          {showDebugPanel ? (
            // Trajectory/debug mode replaces only the transcript — the composer
            // and its controls stay, and auto-scroll keeps matching the chat.
            <ErrorBoundary name="Trajectory panel" variant="section" className="min-h-0 flex-1" resetKeys={[activeSessionId, messages.length, showDebugPanel]}>
              <TrajectoryPanel onClose={onCloseDebugPanel} sessionId={activeSessionId} token={token} />
            </ErrorBoundary>
          ) : (
            <ErrorBoundary name="Chat transcript" variant="section" className={getChatTranscriptBoundaryClassName()} resetKeys={[activeSessionId, messages.length, messageQueue.length, showDesktopProject]}>
              <Conversation
                key={activeSessionId ?? 'developer-empty'}
                sessionId={activeSessionId}
                authToken={token}
                onLatestContentViewed={onLatestContentViewed}
                className={getChatTranscriptBoundaryClassName()}
                compact={showDesktopProject}
                mobile={isMobile}
                loading={isLoadingHistory}
                isStreaming={isLoading}
                loadingLabel="Loading chat"
                messageContents={messageContents}
                messageEstimateInputs={messages}
                hasMore={hasMoreMessages}
                onLoadMore={loadOlderMessages}
                onEditPreviousUserMessage={handleEditPreviousUserMessage}
                scrollToMessageId={scrollToUserMessageId}
                showMinimap={!isMobile}
                elevatedMessageId={messages.find(message => message.id === editingMessageId)?.renderId ?? editingMessageId}
              >
                {messageElements}
                {messageQueue.length > 0 && (
                  <MessageQueue
                    items={messageQueue}
                    onEditingChange={setEditingQueue}
                    onRemove={onDequeueMessage}
                    onEdit={onUpdateQueueItem}
                    onReorder={onReorderQueueItem}
                    onSteer={isLoading && activeSessionId ? onSteerQueuedMessage : undefined}
                    onStopAndSteer={isLoading && activeSessionId ? onStopAndSteerQueuedMessage : undefined}
                    onSendToParallelThread={onAskQueuedMessageInParallel}
                    parallelActionLabel="Ask in parallel"
                    onToggleHold={onToggleHoldQueueItem}
                    iconOnly={isMobile}
                  />
                )}
              </Conversation>
            </ErrorBoundary>
          )}

          {showNormalComposer && (
            <div data-chat-composer-dock className={getChatComposerBoundaryClassName(isMobile)}>
            <div className={getChatColumnClassName('space-y-1.5')}>
              {error && error !== 'login_required' && error !== 'limit_reached' && !isLoading && (
                <div className="flex items-center gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400 dark:text-red-400 dark:border-red-400/40 dark:bg-red-400/10">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 break-words">{error}</span>
                  {activeSessionId && !latestMessageHasError && (
                    <Button type="button" variant="outline" size="sm" disabled={retryDisabled} onClick={handleErrorRetry} className="shrink-0 gap-1.5">
                      <RotateCcw className="h-3 w-3" />
                      Retry
                    </Button>
                  )}
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
              <div className="rounded-2xl border bg-background dark:bg-card focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 overflow-hidden">
              <div className="max-h-[40vh] overflow-y-auto divide-y divide-border [&:not(:empty)]:border-b [&:not(:empty)]:border-border">
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
                <ConsentQueue compact merged sessionId={activeSessionId} onApproveAllEnabled={() => onSetApproveAllInSession(true)} />
              </div>
              {inlinePrompts && <div className="border-b border-border p-2">{inlinePrompts}</div>}
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
                  defaultStreamingAction={defaultStreamingAction}
                  onQueue={onQueue}
                  onSteer={onSteer}
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
                />
              </ErrorBoundary>
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
