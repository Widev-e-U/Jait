import { CheckCircle2 } from 'lucide-react'

import { ManagerRepoPicker } from '@/components/manager/manager-thread-ui'
import { SendTargetSelector, type SendTarget } from '@/components/chat/send-target-selector'
import { SessionSwitcher } from '@/components/chat/session-switcher'
import type { ProjectSession } from '@/hooks/useProjects'
import type { AutomationRepository, RepositoryRuntimeInfo } from '@/lib/automation-repositories'

interface DeveloperComposerControlRowProps {
  activeProjectId: string | null
  activeProjectSessions: ProjectSession[]
  activeProjectTitle: string | null
  activeSessionId: string | null
  approveAllInSession: boolean
  compact: boolean
  disableSendTargetSelector: boolean
  remainingPrompts: number | null
  repositories: AutomationRepository[]
  selectedThreadRepo: AutomationRepository | null
  sendTarget: SendTarget
  threadRepoPickerDisabled: boolean
  getRuntimeInfo: (repo: AutomationRepository) => RepositoryRuntimeInfo
  onAddRepository: () => void
  onClearApproveAll: () => void
  onCreateSession: () => void
  onSendTargetChange: (target: SendTarget) => void
  onSessionSwitcherOpenChange: (open: boolean) => void
  onStartNewChat: () => void
  onSelectRepo: (repoId: string) => void
  onSelectSession: (projectId: string | null, sessionId: string) => void
}

export function DeveloperComposerControlRow({
  activeProjectId,
  activeProjectSessions,
  activeProjectTitle,
  activeSessionId,
  approveAllInSession,
  compact,
  disableSendTargetSelector,
  remainingPrompts,
  repositories,
  selectedThreadRepo,
  sendTarget,
  threadRepoPickerDisabled,
  getRuntimeInfo,
  onAddRepository,
  onClearApproveAll,
  onCreateSession,
  onSendTargetChange,
  onSessionSwitcherOpenChange,
  onStartNewChat,
  onSelectRepo,
  onSelectSession,
}: DeveloperComposerControlRowProps) {
  const threadToolbarRepoPicker = sendTarget === 'thread' ? (
    <ManagerRepoPicker
      repositories={repositories}
      selectedRepo={selectedThreadRepo}
      disabled={threadRepoPickerDisabled}
      compact={compact}
      className={compact ? 'w-full' : ''}
      getRuntimeInfo={getRuntimeInfo}
      onSelect={onSelectRepo}
      onAddRepository={onAddRepository}
    />
  ) : null

  return (
    <div className={`${compact ? 'overflow-hidden px-0.5' : 'overflow-x-auto px-1'}`}>
      <div className={`${compact ? 'flex w-full min-w-0 items-center gap-2' : 'grid min-w-max grid-cols-[1fr_auto_1fr] gap-3 whitespace-nowrap'} items-center`}>
        <div className={`${compact ? 'flex min-w-0 flex-1 items-center gap-1 overflow-hidden' : 'flex min-w-0 flex-1 items-center gap-2'}`}>
          {sendTarget === 'thread' ? (
            threadToolbarRepoPicker
          ) : (
            <SessionSwitcher
              sessions={activeProjectSessions}
              activeSessionId={activeSessionId}
              projectTitle={activeProjectTitle ?? 'Personal chat'}
              onSelectSession={(sessionId) => onSelectSession(activeProjectId, sessionId)}
              onNewSession={onCreateSession}
              onOpenChange={onSessionSwitcherOpenChange}
              showTitle={false}
              triggerLabel="History"
            />
          )}
          {approveAllInSession && (
            <button
              type="button"
              onClick={onClearApproveAll}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-600 transition-colors hover:bg-green-500/20 dark:text-green-400"
              title="Auto-approved. Clear approve all"
              aria-label="Auto-approved. Clear approve all"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {!compact && (
          <div className="justify-self-center">
            <SendTargetSelector
              target={sendTarget}
              onChange={onSendTargetChange}
              disabled={disableSendTargetSelector}
            />
          </div>
        )}
        <div className={`${compact ? 'ml-auto flex shrink-0 items-center gap-2' : 'flex shrink-0 items-center justify-self-end gap-2'}`}>
          {sendTarget !== 'thread' && (
            <button
              type="button"
              onClick={onStartNewChat}
              className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              New chat
            </button>
          )}
          {compact && (
            <div className="shrink-0">
              <SendTargetSelector
                target={sendTarget}
                onChange={onSendTargetChange}
                disabled={disableSendTargetSelector}
                compact
              />
            </div>
          )}
          {remainingPrompts !== null && (
            <span className={`${compact ? 'hidden' : 'shrink-0'} text-xs text-muted-foreground`}>{remainingPrompts} remaining</span>
          )}
        </div>
      </div>
    </div>
  )
}
