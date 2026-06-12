import { AlertTriangle, FolderOpen } from 'lucide-react'
import type { CSSProperties, ReactNode, RefObject } from 'react'

import { Conversation, Message, PromptInput, Suggestions, TodoList, MessageQueue, FilesChanged } from '@/components/chat'
import { PlanReview } from '@/components/chat/plan-review'
import { ConsentQueue } from '@/components/consent'
import { ErrorBoundary } from '@/components/error-boundary'
import { Button } from '@/components/ui/button'

interface DeveloperChatWorkspaceProps {
  activeProject: any
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
  cliModel: string | null
  developerChatPanelStyle: CSSProperties
  developerChatSubmitLoading: boolean
  developerChatUiState: { showTodoList: boolean }
  developerComposerControlRow: ReactNode
  developerPlaceholder: string
  editComposerBag: any
  error: string | null
  hasMessages: boolean
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
  onOpenTerminalFromToolCall: (...args: any[]) => void
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
  onSetApproveAllInSession: (enabled: boolean) => void
  onSteerQueuedMessage?: (id: string) => void
  onStopRecording: () => void
  onSubmit: () => void
  onUpdateQueueItem: (...args: any[]) => void
  onVoiceInput: () => void
  renderInlineSecretPrompt: (call: any) => ReactNode
}

export function DeveloperChatWorkspace({
  activeProject,
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
  cliModel,
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
  onOpenTerminalFromToolCall,
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
  onSetApproveAllInSession,
  onSteerQueuedMessage,
  onStopRecording,
  onSubmit,
  onUpdateQueueItem,
  onVoiceInput,
  renderInlineSecretPrompt,
}: DeveloperChatWorkspaceProps) {
  if (!hasMessages) {
    return (
      <div
        ref={setChatPanelElement}
        className={`relative flex-1 min-w-0 flex flex-col items-center justify-center overflow-hidden ${chatCollapsed ? '' : 'px-4'} ${isMobile ? 'pt-12' : ''}`}
        style={developerChatPanelStyle}
      >
        <div className="w-full max-w-3xl space-y-8">
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
          {developerChatUiState.showTodoList && (
            <TodoList items={todoList} onClear={onClearTodoList} />
          )}
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
              repoRuntime={sendTarget === 'thread' ? threadTargetRepoRuntime : null}
              onMoveToGateway={sendTarget === 'thread' ? onMoveRepoToGateway : undefined}
              availableFiles={availableFilesForMention}
              onSearchFiles={onSearchFiles}
              projectOpen={showProject}
              projectName={activeProjectDisplayName ?? undefined}
              projectPath={activeProjectRoot ?? undefined}
              sessionInfo={sessionInfo}
              projectNodeId={projectNodeId ?? undefined}
            />
          </ErrorBoundary>
          {developerComposerControlRow}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setChatPanelElement}
      className="relative flex flex-col min-h-0 min-w-0 overflow-hidden"
      style={developerChatPanelStyle}
    >
      {!chatCollapsed && (
        <>
          <ErrorBoundary name="Chat transcript" variant="section" className="min-h-0 flex-1 border-b" resetKeys={[activeSessionId, messages.length, messageQueue.length, showDesktopProject]}>
            <Conversation
              key={activeSessionId ?? 'developer-empty'}
              className="min-h-0 flex-1 border-b"
              compact={showDesktopProject}
              loading={isLoadingHistory}
              loadingLabel="Loading chat"
              messageContents={messageContents}
              hasMore={hasMoreMessages}
              onLoadMore={loadOlderMessages}
            >
              {messages.map((msg, idx) => (
                <Message
                  key={msg.id}
                  messageId={msg.id}
                  messageIndex={idx}
                  messageFromEnd={messages.length - 1 - idx}
                  role={msg.role}
                  content={msg.content}
                  contextFlow={msg.contextFlow}
                  displayContent={msg.displayContent}
                  referencedFiles={msg.referencedFiles}
                  displaySegments={msg.displaySegments}
                  attachments={msg.attachments}
                  thinking={msg.thinking}
                  thinkingDuration={msg.thinkingDuration}
                  toolCalls={msg.toolCalls}
                  segments={msg.segments}
                  isStreaming={isLoading && msg === messages[messages.length - 1]}
                  compact={showProject || showScreenShare || previewOpen}
                  preferLlmUi
                  provider={chatProvider}
                  threadControlThreads={managerThreads as unknown as Record<string, unknown>[]}
                  onOpenTerminal={onOpenTerminalFromToolCall}
                  renderInlineSecretPrompt={renderInlineSecretPrompt}
                  onEditMessage={onEditPreviousMessage}
                  editComposer={editComposerBag}
                  onOpenPath={onOpenMessagePath}
                  onOpenDiff={onChangedFileClick}
                  onOpenMemorySource={onMemorySourceOpen}
                  onMemoryFeedback={onHandleMemoryFeedback}
                />
              ))}
              {messageQueue.length > 0 && (
                <MessageQueue
                  items={messageQueue}
                  onRemove={onDequeueMessage}
                  onEdit={onUpdateQueueItem}
                  onReorder={onReorderQueueItem}
                  onSteer={isLoading && activeSessionId ? onSteerQueuedMessage : undefined}
                />
              )}
            </Conversation>
          </ErrorBoundary>

          <div className={`shrink-0 ${isMobile ? 'px-2 py-2' : `py-3 ${showDesktopProject ? 'px-3' : 'px-4'}`}`}>
            <div className="mx-auto w-full max-w-3xl space-y-1.5">
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                {developerChatUiState.showTodoList && (
                  <TodoList items={todoList} onClear={onClearTodoList} />
                )}
                {error && error !== 'login_required' && error !== 'limit_reached' && !isLoading && (
                  <div className="flex items-center gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400 dark:text-red-400 dark:border-red-400/40 dark:bg-red-400/10">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">{error}</span>
                  </div>
                )}
                {hitMaxRounds && !isLoading && (
                  <div className="flex items-center justify-center gap-2 py-1.5">
                    <button
                      onClick={() => onContinueChat({ token, sessionId: activeSessionId })}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-accent transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      Continue
                    </button>
                    <span className="text-xs text-muted-foreground">Agent stopped - continue to resume</span>
                  </div>
                )}
                <ConsentQueue compact sessionId={activeSessionId} onApproveAllEnabled={() => onSetApproveAllInSession(true)} />
                {pendingPlan && (
                  <PlanReview plan={pendingPlan} onApprove={onExecutePlan} onReject={onRejectPlan} isExecuting={isLoading} />
                )}
                {limitReached && (
                  <p className="text-center text-sm text-destructive">Daily limit reached. Come back tomorrow.</p>
                )}
                {changedFiles.length > 0 && (
                  <FilesChanged
                    files={changedFilesForComposer}
                    onAccept={onAcceptFile}
                    onReject={onRejectFile}
                    onAcceptAll={onAcceptAllFiles}
                    onRejectAll={onRejectAllFiles}
                    onFileClick={onChangedFileClick}
                  />
                )}
              </div>
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
                  repoRuntime={sendTarget === 'thread' ? threadTargetRepoRuntime : null}
                  onMoveToGateway={sendTarget === 'thread' ? onMoveRepoToGateway : undefined}
                  availableFiles={availableFilesForMention}
                  onSearchFiles={onSearchFiles}
                  projectOpen={showProject}
                  projectName={activeProjectDisplayName ?? undefined}
                  projectPath={activeProjectRoot ?? undefined}
                  sessionInfo={sessionInfo}
                  projectNodeId={projectNodeId ?? undefined}
                />
              </ErrorBoundary>
              {developerComposerControlRow}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
