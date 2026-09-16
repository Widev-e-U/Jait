import { X } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ResponseStyle } from '@jait/shared'

import { ChatComposerSurface, Conversation, Message, PromptInput, type PromptSkill, type ReferencedFile } from '@/components/chat'
import { Button } from '@/components/ui/button'
import { useChat, type ChatAttachment, type ChatMode } from '@/hooks/useChat'
import type { ProjectSession } from '@/hooks/useProjects'
import type { ProviderId, RuntimeMode } from '@/lib/agents-api'
import type { SessionReasoningEffort } from '@/lib/session-chat-selection'
import type { UserMessageSegment } from '@/lib/user-message-segments'
import { TooltipHint } from '@/components/ui/tooltip'
import { ChatPanelDivider } from './chat-panel-divider'

export interface ParallelChatPrompt {
  content: string
  displayContent?: string
  referencedFiles?: { path: string; name: string }[]
  displaySegments?: UserMessageSegment[]
  attachments?: ChatAttachment[]
}

export interface ParallelChatPanelProps {
  onSessionViewed?: (sessionId: string, lastActiveAt: string) => void
  session: ProjectSession
  token: string | null
  initialPrompt?: ParallelChatPrompt
  provider: ProviderId
  runtimeMode?: RuntimeMode
  responseStyle: ResponseStyle
  model: string | null
  reasoningEffort: SessionReasoningEffort | null
  availableFiles: ReferencedFile[]
  availableSkills: PromptSkill[]
  projectName?: string | null
  projectPath?: string | null
  projectNodeId?: string | null
  isMobile: boolean
  onSearchFiles: (query: string, limit: number, signal?: AbortSignal) => Promise<ReferencedFile[]>
  showHideButton: boolean
  onClose: () => void
  showDivider?: boolean
  /**
   * The shared composer control row (history + new chat + send-target switcher)
   * rendered below the prompt input. Reusing the exact same element as the main
   * developer chat keeps the panel footer identical instead of a bespoke copy.
   */
  composerControlRow?: ReactNode
}

/**
 * Each parallel panel owns its own `useChat` subscription and transcript, so a
 * render of the panel is only worth doing when something it actually reads
 * changed. Without this comparison every streamed token of the *main* chat
 * re-rendered all panels (App re-renders on each token and hands them fresh
 * props), which is what made multi-panel layouts feel laggy.
 *
 * Props are compared by identity — cheap and stable — except for the few
 * derived values that App rebuilds on every render:
 *  - `session`: App re-creates session objects whenever the session lists
 *    refresh, so compare the fields this panel actually reads.
 *  - `showDivider`: a default of `true` is applied internally, so treat
 *    `undefined` and `true` as equal.
 * Callers must therefore pass stable references for collections and callbacks
 * (`availableFiles`, `availableSkills`, `onSearchFiles`, `onClose`, …); App does
 * this via `useCallback`/state and the perf harness mirrors the same contract.
 */
export function areParallelChatPanelPropsEqual(prev: ParallelChatPanelProps, next: ParallelChatPanelProps): boolean {
  const sameSession = prev.session === next.session || (
    prev.session.id === next.session.id &&
    prev.session.projectId === next.session.projectId &&
    prev.session.lastActiveAt === next.session.lastActiveAt
  )

  return (
    sameSession &&
    prev.token === next.token &&
    prev.initialPrompt === next.initialPrompt &&
    prev.provider === next.provider &&
    prev.runtimeMode === next.runtimeMode &&
    prev.responseStyle === next.responseStyle &&
    prev.model === next.model &&
    prev.reasoningEffort === next.reasoningEffort &&
    prev.availableFiles === next.availableFiles &&
    prev.availableSkills === next.availableSkills &&
    prev.projectName === next.projectName &&
    prev.projectPath === next.projectPath &&
    prev.projectNodeId === next.projectNodeId &&
    prev.isMobile === next.isMobile &&
    prev.onSearchFiles === next.onSearchFiles &&
    prev.showHideButton === next.showHideButton &&
    prev.onClose === next.onClose &&
    prev.onSessionViewed === next.onSessionViewed &&
    prev.composerControlRow === next.composerControlRow &&
    (prev.showDivider ?? true) === (next.showDivider ?? true)
  )
}

function ParallelChatPanelImpl({
  session,
  onSessionViewed,
  token,
  initialPrompt,
  provider,
  runtimeMode,
  responseStyle,
  model,
  reasoningEffort,
  availableFiles,
  availableSkills,
  projectName,
  projectPath,
  projectNodeId,
  isMobile,
  onSearchFiles,
  showHideButton,
  onClose,
  composerControlRow,
  showDivider = true,
}: ParallelChatPanelProps) {
  const {
    messages,
    viewedActivityAt,
    isLoading,
    isLoadingHistory,
    error,
    hasMore,
    sendMessage,
    cancelRequest,
    loadOlderMessages,
  } = useChat(session.id, token, undefined, null, session.lastActiveAt)
  const handleLatestContentViewed = useCallback(() => {
    if (viewedActivityAt) onSessionViewed?.(session.id, viewedActivityAt)
  }, [onSessionViewed, session.id, viewedActivityAt])
  const [draft, setDraft] = useState('')
  const [inputVersion, setInputVersion] = useState(0)
  const initialPromptSentRef = useRef(false)

  // Composer selection is panel-local: it starts from whatever the originating
  // request used, then the user can change it here without affecting the main chat.
  const [panelMode, setPanelMode] = useState<ChatMode>('ask')
  const [panelProvider, setPanelProvider] = useState<ProviderId>(provider)
  const [panelRuntimeMode, setPanelRuntimeMode] = useState<RuntimeMode | undefined>(runtimeMode)
  const [panelResponseStyle, setPanelResponseStyle] = useState<ResponseStyle>(responseStyle)
  const [panelModel, setPanelModel] = useState<string | null>(model)
  const [panelReasoningEffort, setPanelReasoningEffort] = useState<SessionReasoningEffort | null>(reasoningEffort)
  const selectionCustomizedRef = useRef(false)

  // Follow the originating selection until the user customizes this panel.
  useEffect(() => {
    if (selectionCustomizedRef.current) return
    setPanelProvider(provider)
    setPanelRuntimeMode(runtimeMode)
    setPanelResponseStyle(responseStyle)
    setPanelModel(model)
    setPanelReasoningEffort(reasoningEffort)
  }, [model, provider, reasoningEffort, responseStyle, runtimeMode])

  const customizeSelection = useCallback(() => {
    selectionCustomizedRef.current = true
  }, [])

  const handleProviderChange = useCallback((next: ProviderId) => {
    customizeSelection()
    setPanelProvider(next)
  }, [customizeSelection])

  const handleModelChange = useCallback((next: string | null) => {
    customizeSelection()
    setPanelModel(next)
  }, [customizeSelection])

  const handleRuntimeModeChange = useCallback((next: RuntimeMode) => {
    customizeSelection()
    setPanelRuntimeMode(next)
  }, [customizeSelection])

  const handleResponseStyleChange = useCallback((next: ResponseStyle) => {
    customizeSelection()
    setPanelResponseStyle(next)
  }, [customizeSelection])

  const handleReasoningEffortChange = useCallback((next: SessionReasoningEffort | null) => {
    customizeSelection()
    setPanelReasoningEffort(next)
  }, [customizeSelection])

  const handleModeChange = useCallback((next: ChatMode) => {
    customizeSelection()
    setPanelMode(next)
  }, [customizeSelection])

  const sendPrompt = useCallback(async (prompt: ParallelChatPrompt) => {
    const result = await sendMessage(prompt.content, {
      token,
      sessionId: session.id,
      mode: panelMode,
      provider: panelProvider,
      runtimeMode: panelRuntimeMode,
      responseStyle: panelResponseStyle,
      model: panelModel,
      reasoningEffort: panelReasoningEffort,
      displayContent: prompt.displayContent,
      referencedFiles: prompt.referencedFiles,
      displaySegments: prompt.displaySegments,
      attachments: prompt.attachments,
    })
    return result
  }, [panelMode, panelModel, panelProvider, panelReasoningEffort, panelResponseStyle, panelRuntimeMode, sendMessage, session.id, token])

  useEffect(() => {
    if (!initialPrompt || isLoadingHistory || initialPromptSentRef.current) return
    initialPromptSentRef.current = true
    void sendPrompt(initialPrompt)
  }, [initialPrompt, isLoadingHistory, sendPrompt])

  const handleSubmit = useCallback((
    referencedFiles?: ReferencedFile[],
    attachments?: ChatAttachment[],
    displaySegments?: UserMessageSegment[],
  ) => {
    const content = draft.trim()
    if ((!content && !attachments?.length) || isLoading) return
    setDraft('')
    setInputVersion((version) => version + 1)
    void sendPrompt({
      content,
      ...(referencedFiles?.length ? {
        referencedFiles: referencedFiles.map(({ path, name }) => ({ path, name })),
      } : {}),
      ...(displaySegments?.length ? { displaySegments } : {}),
      ...(attachments?.length ? { attachments } : {}),
    })
  }, [draft, isLoading, sendPrompt])

  const messageContents = useMemo(() => messages.map((message) => message.content), [messages])

  // Preserve message identities: the minimap caches text layout per message.
  // Cloning history on each token invalidates every cached shape.
  return (
    <>
    {!isMobile && showDivider && <ChatPanelDivider />}
    <section
      className={
        isMobile
          ? 'absolute inset-0 z-30 flex min-h-0 flex-col bg-background'
          : 'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background'
      }
      style={isMobile ? undefined : { flex: 'var(--chat-panel-grow, 1) 1 0%' }}
      aria-label="Secondary chat panel"
    >
      {showHideButton && (
        <TooltipHint content="Hide chat panel">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 z-20 h-8 w-8 bg-background/80 backdrop-blur-sm"
            onClick={onClose}
            aria-label="Hide chat panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </TooltipHint>
      )}

      <Conversation
        onLatestContentViewed={viewedActivityAt ? handleLatestContentViewed : undefined}
        className="min-h-0 flex-1 border-b"
        loading={isLoadingHistory}
        loadingLabel="Loading chat"
        messageContents={messageContents}
        messageEstimateInputs={messages}
        hasMore={hasMore}
        onLoadMore={loadOlderMessages}
        showMinimap={!isMobile}
      >
        {messages.map((message, index) => (
          <Message
            key={message.id}
            messageId={message.id}
            messageIndex={index}
            messageFromEnd={messages.length - 1 - index}
            role={message.role}
            kind={message.kind}
            content={message.content}
            steered={message.steered}
            contextFlow={message.contextFlow}
            hasContextFlow={message.hasContextFlow}
            hasMemoryProvenance={message.hasMemoryProvenance}
            sessionId={session.id}
            authToken={token}
            displayContent={message.displayContent}
            referencedFiles={message.referencedFiles}
            displaySegments={message.displaySegments}
            attachments={message.attachments}
            thinking={message.thinking}
            thinkingDuration={message.thinkingDuration}
            toolCalls={message.toolCalls}
            segments={message.segments}
            isStreaming={isLoading && index === messages.length - 1}
            preferLlmUi
            provider={provider}
          />
        ))}
      </Conversation>

      <div className="relative z-30 isolate shrink-0 bg-background px-2 py-2 pb-3 sm:px-4">
        {error && !isLoading && (
          <div className="mx-auto mb-2 w-full max-w-4xl rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        <div className="mx-auto w-full max-w-4xl space-y-1.5">
        <ChatComposerSurface>
        <PromptInput
          value={draft}
          syncKey={inputVersion}
          draftStateKey={`parallel:${session.id}`}
          onChange={setDraft}
          onSubmit={handleSubmit}
          onStop={cancelRequest}
          isLoading={isLoading}
          placeholder="Ask about the running task…"
          mode={panelMode}
          onModeChange={handleModeChange}
          provider={panelProvider}
          onProviderChange={handleProviderChange}
          providerRuntimeMode={panelRuntimeMode}
          onProviderRuntimeModeChange={handleRuntimeModeChange}
          cliModel={panelModel}
          onCliModelChange={handleModelChange}
          reasoningEffort={panelReasoningEffort}
          onReasoningEffortChange={handleReasoningEffortChange}
          responseStyle={panelResponseStyle}
          onResponseStyleChange={handleResponseStyleChange}
          availableFiles={availableFiles}
          availableSkills={availableSkills}
          onSearchFiles={onSearchFiles}
          projectOpen={Boolean(projectPath)}
          projectName={projectName}
          projectPath={projectPath}
          projectNodeId={projectNodeId ?? undefined}
          projectId={session.projectId}
          chatId={session.id}
        />
        </ChatComposerSurface>
        {composerControlRow}
        </div>
      </div>
    </section>
    </>
  )
}

export const ParallelChatPanel = memo(ParallelChatPanelImpl, areParallelChatPanelPropsEqual)
