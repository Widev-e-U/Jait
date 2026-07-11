import { AlertTriangle, RefreshCw, Loader2 as SpinnerIcon } from 'lucide-react'
import { useRef, type ReactNode, type RefObject } from 'react'

import { Conversation, Message, PromptInput, TodoList, MessageQueue } from '@/components/chat'
import type { PromptInputHandle, ToolCallInfo } from '@/components/chat'
import { ErrorBoundary } from '@/components/error-boundary'
import {
  ManagerRepoPicker,
  ManagerRepoRuntimeMeta,
  ManagerRepositoryPanel,
  ManagerThreadListItem,
  getVisibleThreadPrState,
} from '@/components/manager/manager-thread-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { inferThreadRepositoryName } from '@/lib/automation-repositories'
import type { ProviderId, RuntimeMode } from '@/lib/agents-api'
import type { ResponseStyle } from '@jait/shared'

interface ManagerWorkspaceProps {
  automation: any
  automationMessages: any[]
  availableFiles: any[]
  availableSkills: any[]
  chatProvider: ProviderId
  chatProviderRuntimeMode: RuntimeMode
  chatResponseStyle: ResponseStyle
  cliModel: string | null
  inputValueRef: RefObject<string>
  inputVersion: number
  isMobile: boolean
  managerThreads: any[]
  promptInputRef: RefObject<PromptInputHandle | null>
  selectedManagerQueue: any[]
  selectedRepoOffline: boolean
  selectedRepoRuntime: any
  selectedThreadRepoRuntime: any
  showManagerRepos: boolean
  showProject: boolean
  threadComposerDisabled: boolean
  threadPlaceholder: string
  voiceLevels: number[]
  voiceRecording: boolean
  voiceTranscribing: boolean
  onAddRepository: () => void
  onChangedFileClick: (file: any) => void
  onCliModelChange: (model: string | null) => void
  onDeleteThread: (threadId: string) => void
  onDequeueManagerMessage: (threadId: string, itemId: string) => void
  onHandleInputChange: (value: string) => void
  onManagerQueue: () => void
  onMemorySourceOpen: (source: any) => void
  onMoveRepoToGateway: (...args: any[]) => void
  onOpenManagerPlan: (repo: any) => void
  onOpenManagerStrategy: (repo: any) => void
  onOpenMessagePath: (path: string) => void
  onProviderChange: (provider: ProviderId) => void
  onProviderRuntimeModeChange: (mode: RuntimeMode) => void
  onRefreshThreads: () => void
  onRemoveRepository: (repoId: string) => void
  onReorderManagerQueueItem: (threadId: string, sourceId: string, targetId: string | null, placement: any) => void
  onResponseStyleChange: (style: ResponseStyle) => void
  onSearchFiles: (query: string, limit: number, signal?: AbortSignal) => Promise<any[]>
  onSelectRepository: (repoId: string | null) => void
  onSelectThread: (threadId: string) => void
  onSendManagerQueueItemToParallelThread: (itemId: string) => void
  onSetProjectEditorVisible: (visible: boolean) => void
  onSetProjectVisible: (visible: boolean) => void
  onSteerManagerQueueItem: (itemId: string) => void
  onStopRecording: () => void
  onStopThread: (threadId: string) => void
  onSubmit: () => void
  onUpdateManagerQueueItem: (threadId: string, itemId: string, content: string) => void
  onVoiceInput: () => void
  renderInlineSecretPrompt: (call: ToolCallInfo) => React.ReactNode
  inlinePrompts?: ReactNode
}

export function ManagerWorkspace({
  automation,
  automationMessages,
  availableFiles,
  availableSkills,
  chatProvider,
  chatProviderRuntimeMode,
  chatResponseStyle,
  cliModel,
  inputValueRef,
  inputVersion,
  isMobile,
  managerThreads,
  promptInputRef,
  selectedManagerQueue,
  selectedRepoOffline,
  selectedRepoRuntime,
  selectedThreadRepoRuntime,
  showManagerRepos,
  showProject,
  threadComposerDisabled,
  threadPlaceholder,
  voiceLevels,
  voiceRecording,
  voiceTranscribing,
  onAddRepository,
  onChangedFileClick,
  onCliModelChange,
  onDeleteThread,
  onDequeueManagerMessage,
  onHandleInputChange,
  onManagerQueue,
  onMemorySourceOpen,
  onMoveRepoToGateway,
  onOpenManagerPlan,
  onOpenManagerStrategy,
  onOpenMessagePath,
  onProviderChange,
  onProviderRuntimeModeChange,
  onRefreshThreads,
  onRemoveRepository,
  onReorderManagerQueueItem,
  onResponseStyleChange,
  onSearchFiles,
  onSelectRepository,
  onSelectThread,
  onSendManagerQueueItemToParallelThread,
  onSetProjectEditorVisible,
  onSetProjectVisible,
  onSteerManagerQueueItem,
  onStopRecording,
  onStopThread,
  onSubmit,
  onUpdateManagerQueueItem,
  onVoiceInput,
  renderInlineSecretPrompt,
  inlinePrompts,
}: ManagerWorkspaceProps) {
  // ── Memoized message elements ─────────────────────────────────────────
  // Same rationale as DeveloperChatWorkspace: streaming thread activity
  // rebuilds the messages array per token; caching per-message elements by
  // their own render-relevant inputs means only the streaming message gets a
  // new element, so React skips reconciling the rest.
  const activeThreadId = automation.selectedThread?.id ?? null
  const threadRunning = automation.selectedThread?.status === 'running'
  const threadProvider = automation.selectedThread?.providerId as ProviderId | undefined
  const sharedPropsKey = [
    threadProvider,
    managerThreads,
    renderInlineSecretPrompt,
    onOpenMessagePath,
    onChangedFileClick,
    onMemorySourceOpen,
  ]
  const elementCacheRef = useRef<Map<string, {
    key: string
    element: ReactNode
    content: unknown
    contextFlow: unknown
    toolCalls: unknown
    segments: unknown
    isStreaming: boolean
  }>>(new Map())
  const cacheThreadRef = useRef<string | null>(null)
  if (cacheThreadRef.current !== activeThreadId) {
    elementCacheRef.current.clear()
    cacheThreadRef.current = activeThreadId
  }
  const lastMsgId = automationMessages.length > 0 ? automationMessages[automationMessages.length - 1].id : null
  const sharedKey = JSON.stringify(sharedPropsKey)
  const messageElements: ReactNode[] = []
  {
    const cache = elementCacheRef.current
    for (let idx = 0; idx < automationMessages.length; idx++) {
      const msg = automationMessages[idx]
      const isStreaming = threadRunning && msg.id === lastMsgId
      // Reference-equality key (see DeveloperChatWorkspace for the rationale).
      const cached = cache.get(msg.id)
      const key =
        sharedKey
        + '|' + (msg.content === cached?.content ? 's' : 'd')
        + '|' + (msg.contextFlow === cached?.contextFlow ? 's' : 'd')
        + '|' + (msg.toolCalls === cached?.toolCalls ? 's' : 'd')
        + '|' + (msg.segments === cached?.segments ? 's' : 'd')
        + '|' + (isStreaming === cached?.isStreaming ? 's' : 'd')
        + '|' + msg.role
      if (cached && cached.key === key && !isStreaming) {
        messageElements.push(cached.element)
        continue
      }
      const element = (
        <Message
          key={msg.id}
          messageId={msg.id}
          messageIndex={idx}
          messageFromEnd={automationMessages.length - 1 - idx}
          role={msg.role}
          content={msg.content}
          contextFlow={msg.contextFlow}
          toolCalls={msg.toolCalls}
          segments={msg.segments}
          isStreaming={isStreaming}
          compact
          preferLlmUi={false}
          provider={threadProvider}
          threadControlThreads={managerThreads as unknown as Record<string, unknown>[]}
          renderInlineSecretPrompt={renderInlineSecretPrompt}
          onOpenPath={onOpenMessagePath}
          onOpenDiff={onChangedFileClick}
          onOpenMemorySource={onMemorySourceOpen}
        />
      )
      cache.set(msg.id, {
        key,
        element,
        content: msg.content,
        contextFlow: msg.contextFlow,
        toolCalls: msg.toolCalls,
        segments: msg.segments,
        isStreaming,
      })
      messageElements.push(element)
    }
    if (cache.size > automationMessages.length) {
      const live = new Set(automationMessages.map((m) => m.id))
      for (const id of [...cache.keys()]) if (!live.has(id)) cache.delete(id)
    }
  }

  return (
    <div className={`flex-1 min-w-0 flex flex-col min-h-0 ${isMobile && !automation.selectedThread ? 'pt-12' : ''}`}>
      {automation.selectedThread ? (
        <div className={`flex flex-1 min-h-0 ${isMobile ? 'flex-col' : ''}`}>
          <div className="flex min-w-0 flex-1 flex-col min-h-0">
            <ErrorBoundary name="Thread activity" variant="section" className="min-h-0 flex-1 border-b" resetKeys={[automation.selectedThread?.id, automationMessages.length]}>
              <Conversation
                key={automation.selectedThread?.id ?? 'manager-empty'}
                className="min-h-0 flex-1 border-b"
                loading={automation.loadingActivities}
                loadingLabel="Loading activity"
                messageContents={automationMessages.map((msg) => msg.content)}
              >
                {automationMessages.length === 0 && !automation.loadingActivities && (
                  <div className="text-center text-sm text-muted-foreground py-8">No activity yet</div>
                )}
                {messageElements}
              </Conversation>
            </ErrorBoundary>
            <div className="shrink-0 py-3 px-4">
              <div className="mx-auto max-w-3xl">
                {automation.error && (
                  <div className="flex items-center gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400 mb-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">{automation.error}</span>
                  </div>
                )}
                {selectedManagerQueue.length > 0 && automation.selectedThread && (
                  <MessageQueue
                    items={selectedManagerQueue}
                    onRemove={(id) => onDequeueManagerMessage(automation.selectedThread.id, id)}
                    onEdit={(id, content) => onUpdateManagerQueueItem(automation.selectedThread.id, id, content)}
                    onReorder={(sourceId, targetId, placement) => onReorderManagerQueueItem(automation.selectedThread.id, sourceId, targetId, placement)}
                    onSteer={automation.selectedThread.status === 'running' ? onSteerManagerQueueItem : undefined}
                    onSendToParallelThread={onSendManagerQueueItemToParallelThread}
                    className="mb-2"
                  />
                )}
                {automation.selectedThreadTodos.length > 0 && (
                  <TodoList items={automation.selectedThreadTodos} className="mb-2" />
                )}
                {inlinePrompts}
                <ErrorBoundary name="Thread composer" variant="section" resetKeys={[automation.selectedThread?.id, inputVersion]}>
                  <PromptInput
                    ref={promptInputRef}
                    availableSkills={availableSkills}
                    draftStateKey={`manager:${automation.selectedThread?.id ?? 'new-thread'}`}
                    value={inputValueRef.current}
                    syncKey={inputVersion}
                    onChange={onHandleInputChange}
                    onSubmit={onSubmit}
                    onQueue={onManagerQueue}
                    onStop={() => { if (automation.selectedThread) onStopThread(automation.selectedThread.id) }}
                    isLoading={automation.selectedThread?.status === 'running'}
                    disabled={automation.creating}
                    placeholder={automation.selectedThread?.providerSessionId || automation.selectedThread?.status === 'running' ? 'Send a follow-up message...' : 'Describe what you want to do...'}
                    onVoiceInput={onVoiceInput}
                    voiceRecording={voiceRecording}
                    voiceLevels={voiceLevels}
                    voiceTranscribing={voiceTranscribing}
                    onVoiceStop={onStopRecording}
                    responseStyle={chatResponseStyle}
                    onResponseStyleChange={onResponseStyleChange}
                    provider={chatProvider}
                    onProviderChange={onProviderChange}
                    providerRuntimeMode={chatProviderRuntimeMode}
                    onProviderRuntimeModeChange={onProviderRuntimeModeChange}
                    cliModel={cliModel}
                    onCliModelChange={onCliModelChange}
                    repoRuntime={selectedThreadRepoRuntime}
                    onMoveToGateway={onMoveRepoToGateway}
                    availableFiles={availableFiles}
                    onSearchFiles={onSearchFiles}
                    projectOpen={showProject}
                    chatId={automation.selectedThread?.id ?? undefined}
                  />
                </ErrorBoundary>
                <div className="flex items-center gap-2 px-1 mt-1.5">
                  {selectedThreadRepoRuntime && <ManagerRepoRuntimeMeta runtime={selectedThreadRepoRuntime} />}
                  {automation.selectedThread && automation.selectedThread.status !== 'running' && !automation.selectedThread.providerSessionId && (
                    <span className="text-xs text-muted-foreground truncate">Thread finished - start a new one</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={`flex flex-1 min-h-0 ${isMobile ? 'flex-col' : ''}`}>
          {showManagerRepos && (
            <div className={`overflow-hidden ${isMobile ? 'h-52 shrink-0 border-b' : 'w-56 shrink-0 border-r'}`}>
              <ManagerRepositoryPanel
                repositories={automation.repositories}
                selectedRepoId={automation.selectedRepo?.id ?? null}
                isMobile={isMobile}
                getRuntimeInfo={automation.getRuntimeInfoForRepository}
                onSelect={automation.setSelectedRepoId}
                onAddRepository={onAddRepository}
                onRemoveRepository={onRemoveRepository}
                onOpenStrategy={onOpenManagerStrategy}
                onOpenPlan={onOpenManagerPlan}
              />
            </div>
          )}
          <div className={`flex-1 flex flex-col min-w-0 overflow-y-auto ${isMobile ? 'pt-8' : ''}`}>
            <div className="relative z-10 flex flex-col items-center px-3 pb-8 pt-8 sm:px-4 sm:pb-2 sm:pt-4">
              <div className="w-full max-w-3xl">
                <h1 className="mb-3 text-center text-xl font-semibold tracking-tight sm:mb-4 sm:text-2xl">What do you want to build?</h1>
                {automation.error && (
                  <div className="flex items-center gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400 mb-3">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">{automation.error}</span>
                  </div>
                )}
                <ErrorBoundary name="Thread composer" variant="section" resetKeys={[automation.selectedRepo?.id, inputVersion]}>
                  <PromptInput
                    ref={promptInputRef}
                    availableSkills={availableSkills}
                    draftStateKey={`manager:${automation.selectedRepo?.id ?? 'repo-draft'}`}
                    value={inputValueRef.current}
                    syncKey={inputVersion}
                    onChange={onHandleInputChange}
                    onSubmit={onSubmit}
                    disabled={threadComposerDisabled}
                    controlsDisabled={automation.creating || selectedRepoOffline}
                    placeholder={threadPlaceholder}
                    onVoiceInput={onVoiceInput}
                    voiceRecording={voiceRecording}
                    voiceLevels={voiceLevels}
                    voiceTranscribing={voiceTranscribing}
                    onVoiceStop={onStopRecording}
                    responseStyle={chatResponseStyle}
                    onResponseStyleChange={onResponseStyleChange}
                    provider={chatProvider}
                    onProviderChange={onProviderChange}
                    providerRuntimeMode={chatProviderRuntimeMode}
                    onProviderRuntimeModeChange={onProviderRuntimeModeChange}
                    cliModel={cliModel}
                    onCliModelChange={onCliModelChange}
                    repoRuntime={selectedRepoRuntime}
                    onMoveToGateway={onMoveRepoToGateway}
                  />
                </ErrorBoundary>
                <div className={`${isMobile ? 'overflow-hidden' : 'overflow-x-auto'} px-1 pt-3`}>
                  <div className={`${isMobile ? 'flex min-w-0 items-center gap-2' : 'flex min-w-max items-center gap-2 whitespace-nowrap'}`}>
                    <ManagerRepoPicker
                      repositories={automation.repositories}
                      selectedRepo={automation.selectedRepo}
                      disabled={automation.creating}
                      compact={isMobile}
                      className={isMobile ? 'flex-1' : ''}
                      getRuntimeInfo={automation.getRuntimeInfoForRepository}
                      onSelect={onSelectRepository}
                      onAddRepository={onAddRepository}
                    />
                    {selectedRepoRuntime && <ManagerRepoRuntimeMeta runtime={selectedRepoRuntime} />}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl">
                <div className="sticky top-0 z-10 flex h-[35px] items-center justify-between border-b bg-background px-2.5 sm:px-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">Threads</span>
                    <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-2xs">
                      {managerThreads.length}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRefreshThreads}>
                    <RefreshCw className={`h-3.5 w-3.5 ${automation.loading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                {managerThreads.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground sm:py-12">No threads yet</div>
                ) : (
                  <div className="flex flex-col">
                    {managerThreads.map((thread) => {
                      const threadRepo = automation.getRepositoryForThread(thread)
                      const repoName = threadRepo?.name ?? inferThreadRepositoryName(thread) ?? 'Unknown repo'
                      const prState = getVisibleThreadPrState(
                        thread,
                        thread.id in automation.threadPrStates ? automation.threadPrStates[thread.id] : undefined,
                      )
                      return (
                        <ManagerThreadListItem
                          key={thread.id}
                          thread={thread}
                          repo={threadRepo}
                          repoName={repoName}
                          prState={prState}
                          ghAvailable={automation.ghAvailable}
                          onOpen={() => {
                            onSelectThread(thread.id)
                            onSetProjectVisible(false)
                            onSetProjectEditorVisible(false)
                          }}
                          onStop={() => onStopThread(thread.id)}
                          onDelete={async () => { onDeleteThread(thread.id) }}
                        />
                      )
                    })}
                    {automation.hasMoreThreads && (
                      <button
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-70 sm:px-4 sm:py-2"
                        disabled={automation.loading}
                        onClick={automation.showMoreThreads}
                      >
                        {automation.loading ? <SpinnerIcon className="h-3 w-3 animate-spin" /> : null}
                        Show more threads
                      </button>
                    )}
                    {managerThreads.length > automation.threadListLimit && (
                      <button
                        className="px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground sm:px-4 sm:py-2"
                        onClick={automation.showFewerThreads}
                      >
                        Show less
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
