import { ProviderUsageBadge } from '@/components/chat/provider-usage-badge'
import { collectAttachments } from '@/components/chat/attachment-list'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ResponseStyle } from '@jait/shared'

import { toast } from 'sonner'

import { X } from 'lucide-react'

import { Conversation, Message, MessageQueue, PromptInput, type PromptSkill, type ReferencedFile } from '@/components/chat'
import { Button } from '@/components/ui/button'
import { useChat, type ChatAttachment, type ChatMode } from '@/hooks/useChat'
import type { ProjectSession } from '@/hooks/useProjects'
import { API_URL } from '@/lib/gateway-url'
import type { ProviderId, RuntimeMode } from '@/lib/agents-api'
import { shouldProcessQueuedMessage } from '@/lib/chat-queue-decision'
import type { SessionReasoningEffort } from '@/lib/session-chat-selection'
import { serializeUserMessageSegmentsToMarkdown, userMessageTextFromSegments, userReferencedFilesFromSegments, type UserMessageSegment } from '@/lib/user-message-segments'
import { mergeAttachmentsIntoSegments } from '@/lib/message-segment-builders'
import type { DefaultStreamingAction } from '@/lib/prompt-submit-routing'
import { TooltipHint } from '@/components/ui/tooltip'
import {
  getChatColumnClassName,
  getChatComposerBoundaryClassName,
  shouldShowNormalChatComposer,
} from '@/components/chat/message-edit-layout'
import { ChatPanelDivider } from './chat-panel-divider'

export interface ParallelChatPrompt {
  content: string
  displayContent?: string
  referencedFiles?: ReferencedFile[]
  displaySegments?: UserMessageSegment[]
  attachments?: ChatAttachment[]
}

function buildParallelPrompt(
  rawValue: string,
  referencedFiles?: ReferencedFile[],
  attachments?: ChatAttachment[],
  displaySegments?: UserMessageSegment[],
): ParallelChatPrompt | null {
  const text = (displaySegments?.length ? userMessageTextFromSegments(displaySegments) : rawValue).trim()
  const uploads = collectAttachments(attachments, displaySegments)
  const references = (displaySegments ?? []).filter(segment => (
    segment.type === 'project' || segment.type === 'terminal' || segment.type === 'chat' || (!text && segment.type === 'file')
  ))
  const content = [text, ...references.map(reference => serializeUserMessageSegmentsToMarkdown([reference]))]
    .filter(Boolean).join('\n')
  if (!content && !referencedFiles?.length && !uploads.length) return null
  return {
    content,
    displayContent: text,
    referencedFiles,
    attachments: uploads,
    displaySegments: mergeAttachmentsIntoSegments(displaySegments, uploads),
  }
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
  /**
   * Enter-while-streaming behavior for the panel composer: steer the running
   * turn or queue the message. Mirrors the main chat's setting; defaults to
   * 'steer' when omitted.
   */
  defaultStreamingAction?: DefaultStreamingAction
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
    (prev.showDivider ?? true) === (next.showDivider ?? true) &&
    prev.defaultStreamingAction === next.defaultStreamingAction
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
  defaultStreamingAction = 'steer',
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
    messageQueue,
    enqueueMessage,
    dequeueMessage,
    recordSteeredMessage,
    updateQueueItem,
    reorderQueueItem,
    toggleHoldQueueItem,
  } = useChat(session.id, token, undefined, null, session.lastActiveAt)
  const handleLatestContentViewed = useCallback(() => {
    if (viewedActivityAt) onSessionViewed?.(session.id, viewedActivityAt)
  }, [onSessionViewed, session.id, viewedActivityAt])
  const [editingQueue, setEditingQueue] = useState(false)
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

  const sendPrompt = useCallback(async (prompt: ParallelChatPrompt, options?: { queued?: boolean }) => {
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
      // Mark queue-drain sends so the 202 handler in `useChat` does not mirror
      // the server-assigned entry back into the local queue (which would
      // multiply the message).
      ...(options?.queued ? { queued: true } : {}),
    })
    return result
  }, [panelMode, panelModel, panelProvider, panelReasoningEffort, panelResponseStyle, panelRuntimeMode, sendMessage, session.id, token])

  useEffect(() => {
    if (!initialPrompt || isLoadingHistory || initialPromptSentRef.current) return
    initialPromptSentRef.current = true
    void sendPrompt(initialPrompt)
  }, [initialPrompt, isLoadingHistory, sendPrompt])

  // Queue auto-drain. A panel's queue lives only in this client: unlike the
  // main chat it is never synced to the server as `queued_messages`, so the
  // gateway's server-side drain does not know about locally enqueued (`q-`)
  // items and the panel must send them itself once the current turn ends.
  // Server-mirrored entries (ids without the `q-` prefix, created when a send
  // returns 202 during streaming) are skipped — the gateway drains those on
  // `done` and the panel sees them reappear as user messages.
  const isProcessingQueueRef = useRef(false)

  useEffect(() => {
    if (
      !shouldProcessQueuedMessage({
        hasInterruptedExit: false,
        isLoading,
        isLoadingHistory,
        queuedCount: messageQueue.length,
        allowQueuedMessageAfterInterruptedExit: false,
        isProcessing: isProcessingQueueRef.current,
        nextItemHeld: messageQueue[0]?.held ?? false,
      })
    ) {
      return
    }

    const nextItem = messageQueue[0]
    if (!nextItem || !nextItem.id.startsWith('q-')) return
    if (nextItem.held) return

    isProcessingQueueRef.current = true
    void Promise.resolve(
      sendPrompt(
        {
          content: nextItem.content,
          ...(nextItem.displayContent ? { displayContent: nextItem.displayContent } : {}),
          ...(nextItem.referencedFiles?.length ? { referencedFiles: nextItem.referencedFiles } : {}),
          ...(nextItem.displaySegments?.length ? { displaySegments: nextItem.displaySegments } : {}),
          ...(nextItem.attachments?.length ? { attachments: nextItem.attachments } : {}),
        },
        { queued: true },
      ),
    )
      .then((result) => {
        if (result === 'sent' || result === 'queued') {
          dequeueMessage(nextItem.id)
        } else {
          toast.error('Failed to send queued message')
        }
      })
      .catch(() => {
        toast.error('Failed to send queued message')
      })
      .finally(() => {
        isProcessingQueueRef.current = false
      })
  }, [dequeueMessage, isLoading, isLoadingHistory, messageQueue, sendPrompt])

  const resetDraft = useCallback(() => {
    setDraft('')
    setInputVersion(version => version + 1)
  }, [])

  const handleSteer = useCallback((
    referencedFiles?: ReferencedFile[],
    attachments?: ChatAttachment[],
    displaySegments?: UserMessageSegment[],
  ) => {
    if (!isLoading) return
    const prompt = buildParallelPrompt(draft, referencedFiles, attachments, displaySegments)
    if (!prompt) return
    recordSteeredMessage(prompt.content, prompt.displayContent, prompt.attachments)
    resetDraft()
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/api/sessions/${encodeURIComponent(session.id)}/steer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: prompt.content,
            referencedFiles: prompt.referencedFiles,
            attachments: prompt.attachments,
            displaySegments: prompt.displaySegments,
          }),
        })
        if (!response.ok) throw new Error(`Steer failed (${response.status})`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to steer')
        enqueueMessage(prompt)
      }
    })()
  }, [draft, enqueueMessage, isLoading, recordSteeredMessage, resetDraft, session.id, token])

  const handleQueueMessage = useCallback((
    referencedFiles?: ReferencedFile[],
    attachments?: ChatAttachment[],
    displaySegments?: UserMessageSegment[],
  ) => {
    if (!isLoading) return
    const prompt = buildParallelPrompt(draft, referencedFiles, attachments, displaySegments)
    if (!prompt) return
    enqueueMessage(prompt)
    resetDraft()
  }, [draft, enqueueMessage, isLoading, resetDraft])

  const handleSubmit = useCallback((
    referencedFiles?: ReferencedFile[],
    attachments?: ChatAttachment[],
    displaySegments?: UserMessageSegment[],
  ) => {
    if (isLoading) return
    const prompt = buildParallelPrompt(draft, referencedFiles, attachments, displaySegments)
    if (!prompt) return
    resetDraft()
    void sendPrompt(prompt)
  }, [draft, isLoading, resetDraft, sendPrompt])

  const handleEditQueueMessage = useCallback((
    id: string,
    content: string,
    attachments?: ChatAttachment[],
    displaySegments?: UserMessageSegment[],
  ) => {
    const prompt = buildParallelPrompt(content, userReferencedFilesFromSegments(displaySegments), attachments, displaySegments)
    if (prompt) updateQueueItem(id, content, prompt.attachments, prompt.displaySegments, prompt.content)
  }, [updateQueueItem])

  const composerContext = {
    availableSkills,
    availableFiles,
    onSearchFiles,
    projectOpen: Boolean(projectPath),
    projectName,
    projectPath,
    projectNodeId: projectNodeId ?? undefined,
    projectId: session.projectId,
    chatId: session.id,
  }

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
      data-browser-chat-scope
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
        sessionId={session.id}
        authToken={token}
        onLatestContentViewed={viewedActivityAt ? handleLatestContentViewed : undefined}
        className="min-h-0 flex-1"
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
            persona={message.persona}
            kind={message.kind}
            content={message.content}
            steered={message.steered}
            sendState={message.sendState}
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

      <div data-chat-composer-dock className={getChatComposerBoundaryClassName(isMobile)}>
        {error && !isLoading && (
          <div className={getChatColumnClassName('mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive')}>
            {error}
          </div>
        )}
        <div className={getChatColumnClassName('space-y-1.5')}>
        {messageQueue.length > 0 && (
          <MessageQueue
            composerContext={composerContext}
            items={messageQueue}
            onEditingChange={setEditingQueue}
            onRemove={dequeueMessage}
            onEdit={handleEditQueueMessage}
            onReorder={reorderQueueItem}
            onToggleHold={toggleHoldQueueItem}
            iconOnly={isMobile}
          />
        )}
        <div hidden={!shouldShowNormalChatComposer(isMobile, null, editingQueue)} className="space-y-1.5">
        <div className="rounded-2xl border bg-background dark:bg-card focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-inset focus-within:ring-primary/20 overflow-hidden">
        <PromptInput
          {...composerContext}
          merged
          value={draft}
          syncKey={inputVersion}
          draftStateKey={`parallel:${session.id}`}
          onChange={setDraft}
          onSubmit={handleSubmit}
          onSteer={handleSteer}
          onQueue={handleQueueMessage}
          defaultStreamingAction={defaultStreamingAction}
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
        />
        </div>
        {composerControlRow}
        </div>
        </div>
      </div>
      <div className="shrink-0 px-2 pb-1 empty:hidden">
        <ProviderUsageBadge provider={panelProvider} model={panelModel} />
      </div>
    </section>
    </>
  )
}

export const ParallelChatPanel = memo(ParallelChatPanelImpl, areParallelChatPanelPropsEqual)
