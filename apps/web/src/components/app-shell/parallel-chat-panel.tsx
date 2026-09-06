import { GitBranch, Maximize2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ResponseStyle } from '@jait/shared'

import { Conversation, Message, PromptInput, type PromptSkill, type ReferencedFile } from '@/components/chat'
import { Button } from '@/components/ui/button'
import { useChat, type ChatAttachment } from '@/hooks/useChat'
import type { ProjectSession } from '@/hooks/useProjects'
import type { ProviderId, RuntimeMode } from '@/lib/agents-api'
import type { SessionReasoningEffort } from '@/lib/session-chat-selection'
import type { UserMessageSegment } from '@/lib/user-message-segments'
import { TooltipHint } from '@/components/ui/tooltip'

export interface ParallelChatPrompt {
  content: string
  displayContent?: string
  referencedFiles?: { path: string; name: string }[]
  displaySegments?: UserMessageSegment[]
  attachments?: ChatAttachment[]
}

interface ParallelChatPanelProps {
  session: ProjectSession
  token: string | null
  initialPrompt: ParallelChatPrompt
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
  onClose: () => void
  onOpenAsPrimary: () => void
}

export function ParallelChatPanel({
  session,
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
  onClose,
  onOpenAsPrimary,
}: ParallelChatPanelProps) {
  const {
    messages,
    isLoading,
    isLoadingHistory,
    error,
    hasMore,
    sendMessage,
    cancelRequest,
    loadOlderMessages,
  } = useChat(session.id, token, undefined, null, session.lastActiveAt)
  const [draft, setDraft] = useState('')
  const [inputVersion, setInputVersion] = useState(0)
  const initialPromptSentRef = useRef(false)

  const sendPrompt = useCallback(async (prompt: ParallelChatPrompt) => {
    const result = await sendMessage(prompt.content, {
      token,
      sessionId: session.id,
      mode: 'ask',
      provider,
      runtimeMode,
      responseStyle,
      model,
      reasoningEffort,
      displayContent: prompt.displayContent,
      referencedFiles: prompt.referencedFiles,
      displaySegments: prompt.displaySegments,
      attachments: prompt.attachments,
    })
    return result
  }, [model, provider, reasoningEffort, responseStyle, runtimeMode, sendMessage, session.id, token])

  useEffect(() => {
    if (isLoadingHistory || initialPromptSentRef.current) return
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
  const messageEstimateInputs = useMemo(() => messages.map((message) => ({
    ...message,
    role: message.role === 'assistant' ? 'agent' as const : 'user' as const,
  })), [messages])

  return (
    <section
      className={
        isMobile
          ? 'absolute inset-0 z-30 flex min-h-0 flex-col bg-background'
          : 'flex min-h-0 w-[min(42vw,560px)] shrink-0 flex-col border-l bg-background'
      }
      aria-label="Parallel question branch"
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <GitBranch className="h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">Question branch</div>
          <div className="truncate text-[11px] text-muted-foreground">{session.name}</div>
        </div>
        <TooltipHint content="Open as primary chat">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenAsPrimary} aria-label="Open as primary chat">
          <Maximize2 className="h-4 w-4" />
        </Button>
        </TooltipHint>
        <TooltipHint content="Close question branch">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close question branch">
          <X className="h-4 w-4" />
        </Button>
        </TooltipHint>
      </header>

      <Conversation
        className="min-h-0 flex-1 border-b"
        compact
        loading={isLoadingHistory}
        loadingLabel="Loading branch"
        messageContents={messageContents}
        messageEstimateInputs={messageEstimateInputs}
        hasMore={hasMore}
        onLoadMore={loadOlderMessages}
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
            compact
            preferLlmUi
            provider={provider}
          />
        ))}
      </Conversation>

      <div className="shrink-0 p-3">
        {error && !isLoading && (
          <div className="mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        <PromptInput
          value={draft}
          syncKey={inputVersion}
          draftStateKey={`parallel:${session.id}`}
          onChange={setDraft}
          onSubmit={handleSubmit}
          onStop={cancelRequest}
          isLoading={isLoading}
          placeholder="Ask about the running task…"
          mode="ask"
          provider={provider}
          providerRuntimeMode={runtimeMode}
          cliModel={model}
          reasoningEffort={reasoningEffort}
          responseStyle={responseStyle}
          availableFiles={availableFiles}
          availableSkills={availableSkills}
          onSearchFiles={onSearchFiles}
          projectOpen={Boolean(projectPath)}
          projectName={projectName}
          projectPath={projectPath}
          projectNodeId={projectNodeId ?? undefined}
          projectId={session.projectId}
          chatId={session.id}
          footerLeadingContent={(
            <span className="inline-flex h-7 items-center rounded-md bg-muted px-2 text-xs font-medium text-muted-foreground">
              Ask mode · independent snapshot
            </span>
          )}
        />
      </div>
    </section>
  )
}
