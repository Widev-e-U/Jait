import {
  ArrowLeft,
  Boxes,
  Bug,
  Code,
  FolderOpen,
  GitBranch,
  Globe,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Square,
  Terminal as TerminalIcon,
  X,
} from 'lucide-react'

import { ThreadActions } from '@/components/automation/ThreadActions'
import { ThreadSkillPicker } from '@/components/automation/ThreadSkillPicker'
import {
  ManagerStatusDot,
  TitleSkeleton,
  ThreadKindBadge,
  isTitlePending,
} from '@/components/manager/manager-thread-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { useAutomation } from '@/hooks/useAutomation'
import type { ActiveProjectState } from '@/lib/active-project'
import type { AutomationRepository } from '@/lib/automation-repositories'
import { isMobileProjectTargetActive, type MobileProjectControlState, type MobileProjectTarget } from '@/lib/mobile-project-controls'
import type { AppView } from '@/lib/app-view'
import type { ViewMode } from '@/components/chat/view-mode-selector'
import { canStopThread } from '@/lib/thread-status'

interface ChatToolbarProps {
  activeProject: ActiveProjectState
  activeProjectId: string | null
  automation: ReturnType<typeof useAutomation>
  changedFilesCount: number
  compactManagerToolbar: boolean
  currentView: AppView
  isMobile: boolean
  mobileProjectControlState: MobileProjectControlState
  previewOpen: boolean
  showArchitecture: boolean
  showDebugPanel: boolean
  showManagerRepos: boolean
  showProject: boolean
  showSidebar: boolean
  showTerminal: boolean
  token: string | null
  viewMode: ViewMode
  onBackFromManagerThread: () => void
  onMobileProjectTargetAction: (target: MobileProjectTarget) => void
  onOpenPlan: (repo: AutomationRepository) => void
  onOpenStrategy: (repo: AutomationRepository) => void
  onToggleArchitecture: () => void
  onToggleDebugPanel: () => void
  onToggleEditor: () => void
  onToggleManagerRepos: () => void
  onTogglePreview: () => void
  onToggleSidebar: () => void
  onToggleTerminal: () => void
}

export function ChatToolbar({
  activeProject,
  activeProjectId,
  automation,
  changedFilesCount,
  compactManagerToolbar,
  currentView,
  isMobile,
  mobileProjectControlState,
  previewOpen,
  showArchitecture,
  showDebugPanel,
  showManagerRepos,
  showProject,
  showSidebar,
  showTerminal,
  token,
  viewMode,
  onBackFromManagerThread,
  onMobileProjectTargetAction,
  onOpenPlan,
  onOpenStrategy,
  onToggleArchitecture,
  onToggleDebugPanel,
  onToggleEditor,
  onToggleManagerRepos,
  onTogglePreview,
  onToggleSidebar,
  onToggleTerminal,
}: ChatToolbarProps) {
  if (currentView !== 'chat' || (!isMobile && viewMode !== 'manager')) return null

  return (
    <div
      className={`border-b bg-muted/30 px-2 sm:px-5 shrink-0 ${isMobile && !compactManagerToolbar ? 'hidden' : 'flex'} ${
        compactManagerToolbar
          ? 'min-h-[35px] items-center gap-1.5 pt-14 py-2'
          : 'h-11 md:h-[35px] items-center gap-1 overflow-x-auto overflow-y-visible scrollbar-none'
      }`}
    >
      {viewMode === 'developer' && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showSidebar ? 'secondary' : 'ghost'}
              size="sm"
              className={isMobile ? 'h-8 w-8 shrink-0 rounded-md p-0' : 'h-7 shrink-0 rounded-md px-2 text-xs'}
              onClick={onToggleSidebar}
              aria-label="Toggle projects sidebar"
            >
              {showSidebar
                ? <PanelLeftClose className={`${isMobile ? 'h-3.5 w-3.5 rotate-90' : 'h-3 w-3 mr-1'}`} />
                : <PanelLeftOpen className={`${isMobile ? 'h-3.5 w-3.5 rotate-90' : 'h-3 w-3 mr-1'}`} />
              }
              {!isMobile && 'Projects'}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Toggle projects sidebar</TooltipContent>
        </Tooltip>
      )}

      {viewMode === 'developer' && !isMobile && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showTerminal ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 shrink-0 rounded-md px-2 text-xs"
              onClick={onToggleTerminal}
            >
              <TerminalIcon className="h-3 w-3 mr-1" />
              Terminal
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Toggle terminal panel</TooltipContent>
        </Tooltip>
      )}
      {viewMode === 'developer' && isMobile && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isMobileProjectTargetActive(mobileProjectControlState, 'terminal') ? 'secondary' : 'ghost'}
              size="sm"
              className="h-9 w-9 shrink-0 rounded-md p-0"
              aria-label="Terminal"
              onClick={() => onMobileProjectTargetAction('terminal')}
            >
              <TerminalIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Terminal</TooltipContent>
        </Tooltip>
      )}

      {viewMode === 'manager' && automation.selectedThread && !isMobile && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs px-2 shrink-0"
          onClick={onBackFromManagerThread}
        >
          <ArrowLeft className="h-3 w-3 mr-1" />
          Back
        </Button>
      )}

      {activeProjectId && (viewMode === 'developer' || (viewMode === 'manager' && automation.selectedThread)) && !(isMobile && viewMode === 'manager') && (
        <>
          <div className={`flex items-center shrink-0 ${isMobile ? 'gap-1' : ''}`}>
            {isMobile ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isMobileProjectTargetActive(mobileProjectControlState, 'files') ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-9 w-9 rounded-md p-0"
                      aria-label="Files"
                      onClick={() => onMobileProjectTargetAction('files')}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Files</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isMobileProjectTargetActive(mobileProjectControlState, 'git') ? 'secondary' : 'ghost'}
                      size="sm"
                      className="relative h-9 w-9 rounded-md p-0"
                      aria-label="Changes"
                      onClick={() => onMobileProjectTargetAction('git')}
                    >
                      <GitBranch className="h-4 w-4" />
                      {changedFilesCount > 0 && (
                        <span className="absolute -right-1 -top-1 z-10 min-w-[14px] rounded-full bg-primary px-1 text-2xs font-bold leading-[14px] text-primary-foreground">
                          {changedFilesCount > 99 ? '99+' : changedFilesCount}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Changes</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isMobileProjectTargetActive(mobileProjectControlState, 'editor') ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-9 w-9 rounded-md p-0"
                      aria-label="Editor"
                      onClick={() => onMobileProjectTargetAction('editor')}
                    >
                      <Code className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Editor</TooltipContent>
                </Tooltip>
              </>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showProject ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 rounded-md px-2 text-xs"
                    onClick={onToggleEditor}
                  >
                    <Code className="h-3 w-3 mr-1" />
                    Editor
                    {showProject && <X className="h-3 w-3 ml-1" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{showProject ? 'Hide editor' : 'Show editor'}</TooltipContent>
              </Tooltip>
            )}
          </div>

          {viewMode === 'developer' && showProject && activeProject && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={previewOpen ? 'secondary' : 'ghost'}
                  size="sm"
                  className={isMobile ? 'h-9 w-9 shrink-0 rounded-md p-0' : 'h-7 shrink-0 rounded-md px-2 text-xs'}
                  aria-label={previewOpen ? 'Close preview' : 'Open preview'}
                  onClick={onTogglePreview}
                >
                  <Globe className={`h-3 w-3${isMobile ? '' : ' mr-1'}`} />
                  {!isMobile && 'Preview'}
                  {!isMobile && previewOpen && <X className="h-3 w-3 ml-1" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{previewOpen ? 'Close preview' : 'Open dev preview'}</TooltipContent>
            </Tooltip>
          )}
        </>
      )}

      {viewMode === 'developer' && showProject && activeProject && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showArchitecture ? 'secondary' : 'ghost'}
              size="sm"
              className={isMobile ? 'h-9 w-9 shrink-0 rounded-md p-0' : 'h-7 shrink-0 rounded-md px-2 text-xs'}
              aria-label={showArchitecture ? 'Close architecture' : 'Open architecture'}
              onClick={onToggleArchitecture}
            >
              <Boxes className={`h-3 w-3${isMobile ? '' : ' mr-1'}`} />
              {!isMobile && 'Architecture'}
              {!isMobile && showArchitecture && <X className="h-3 w-3 ml-1" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Software architecture diagram</TooltipContent>
        </Tooltip>
      )}

      {viewMode === 'developer' && showProject && activeProject && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showDebugPanel ? 'secondary' : 'ghost'}
              size="sm"
              className="ml-auto h-6 w-6 shrink-0 p-0"
              onClick={onToggleDebugPanel}
            >
              <Bug className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">SSE debug stream</TooltipContent>
        </Tooltip>
      )}

      {viewMode === 'manager' && (
        <>
          {automation.selectedThread ? null : (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showManagerRepos ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-6 text-xs px-2 shrink-0"
                    onClick={onToggleManagerRepos}
                  >
                    {showManagerRepos
                      ? <PanelLeftClose className={`h-3 w-3 mr-1${isMobile ? ' rotate-90' : ''}`} />
                      : <PanelLeftOpen className={`h-3 w-3 mr-1${isMobile ? ' rotate-90' : ''}`} />
                    }
                    Repositories
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Toggle repositories panel</TooltipContent>
              </Tooltip>
              {automation.selectedRepo && automation.selectedRepo.source === 'local' && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2 shrink-0"
                        onClick={() => onOpenStrategy(automation.selectedRepo!)}
                      >
                        <ScrollText className="h-3 w-3 mr-1" />
                        Strategy
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Open repository strategy</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2 shrink-0"
                        onClick={() => onOpenPlan(automation.selectedRepo!)}
                      >
                        <ListChecks className="h-3 w-3 mr-1" />
                        Todos
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Open todo plan</TooltipContent>
                  </Tooltip>
                </>
              )}
            </>
          )}
          {!(isMobile && automation.selectedThread) && <div className="flex-1" />}
          {automation.selectedThread ? (
            <div className={isMobile ? 'flex min-w-0 flex-1 items-center gap-1.5' : 'flex min-w-0 items-center gap-2 shrink-0'}>
              {isMobile && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 shrink-0 p-0"
                  onClick={onBackFromManagerThread}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Button>
              )}
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <ManagerStatusDot status={automation.selectedThread.status} />
                {isMobile ? (
                  <div className="min-w-0 flex-1">
                    {isTitlePending(automation.selectedThread.title) ? (
                      <TitleSkeleton className="text-xs h-3.5 w-28" />
                    ) : (
                      <span className="block truncate text-2xs leading-tight text-muted-foreground sm:text-xs">
                        {automation.selectedThread.title.replace(/^\[.*?\]\s*/, '')}
                      </span>
                    )}
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-2xs leading-tight text-muted-foreground">
                      {automation.selectedRepo && (
                        <span className="min-w-0 truncate">
                          {automation.selectedRepo.name} · {automation.selectedRepo.defaultBranch}
                        </span>
                      )}
                      <ThreadKindBadge kind={automation.selectedThread.kind} />
                      {automation.selectedThread.branch && (
                        <span className="shrink min-w-0 truncate font-mono">
                          {automation.selectedThread.branch}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="min-w-0 flex items-center gap-2">
                    {isTitlePending(automation.selectedThread.title) ? (
                      <TitleSkeleton className="text-xs h-3.5 w-28" />
                    ) : (
                      <span className="max-w-[200px] truncate text-2xs text-muted-foreground sm:text-xs">
                        {automation.selectedThread.title.replace(/^\[.*?\]\s*/, '')}
                      </span>
                    )}
                    <ThreadKindBadge kind={automation.selectedThread.kind} />
                    {automation.selectedRepo && (
                      <span className="max-w-[160px] truncate text-2xs text-muted-foreground">
                        {automation.selectedRepo.name} · {automation.selectedRepo.defaultBranch}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                <ThreadSkillPicker
                  token={token}
                  threadId={automation.selectedThread.id}
                  selectedSkillIds={automation.selectedThread.skillIds}
                />
                {!isMobile && automation.selectedThread.branch && (
                  <Badge variant="outline" className="text-2xs px-1 py-0 font-mono">
                    {automation.selectedThread.branch}
                  </Badge>
                )}
                {canStopThread(automation.selectedThread) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-[18px] w-[18px] sm:h-5 sm:w-5"
                    onClick={() => void automation.handleStop(automation.selectedThread!.id)}
                    title={automation.selectedThread.kind === 'delegation' ? 'End helper thread' : 'Stop thread'}
                  >
                    <Square className="h-2.5 w-2.5" />
                  </Button>
                )}
                {automation.showGitActions && automation.selectedRepo && (
                  <div className={isMobile ? 'shrink-0' : 'ml-2 shrink-0'}>
                    <ThreadActions
                      threadId={automation.selectedThread.id}
                      cwd={automation.selectedThread.workingDirectory ?? automation.selectedRepo.localPath}
                      branch={automation.selectedThread.branch}
                      baseBranch={automation.selectedRepo.defaultBranch}
                      threadTitle={automation.selectedThread.title}
                      threadStatus={automation.selectedThread.status}
                      threadKind={automation.selectedThread.kind}
                      prUrl={automation.selectedThread.prUrl}
                      prState={(automation.selectedThread.id in automation.threadPrStates ? automation.threadPrStates[automation.selectedThread.id] : automation.selectedThread.prState) as 'creating' | 'open' | 'closed' | 'merged' | null | undefined}
                      ghAvailable={automation.ghAvailable}
                      showStatusBadge={!isMobile}
                      changeFiles={automation.selectedThread.changeFiles}
                      changeInsertions={automation.selectedThread.changeInsertions}
                      changeDeletions={automation.selectedThread.changeDeletions}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
