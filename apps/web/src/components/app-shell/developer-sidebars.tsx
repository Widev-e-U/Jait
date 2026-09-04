import { Boxes, Bug, Code, Folders, Globe, MessageSquare, Settings, Terminal as TerminalIcon } from 'lucide-react'
import type { FocusEvent, RefObject } from 'react'

import { SessionSelector } from '@/components/chat'
import { ErrorBoundary } from '@/components/error-boundary'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { SessionInfo } from '@/hooks/useChat'
import type { ProjectSearchResults, ProjectSession, ProjectRecord } from '@/hooks/useProjects'
import type { ActiveProjectState } from '@/lib/active-project'
import type { AutomationRepository } from '@/lib/automation-repositories'
import type { DeveloperSidebarView } from '@/lib/developer-sidebar'

interface DeveloperSidebarsProps {
  activeProject: ActiveProjectState
  activeProjectId: string | null
  activeSessionId: string | null
  authLoading: boolean
  fsNodes: import('@jait/shared').FsNode[]
  hasMoreProjects: boolean
  isMobile: boolean
  personalSessions: ProjectSession[]
  previewOpen: boolean
  projectListLimit: number
  projects: ProjectRecord[]
  projectsLoading: boolean
  repositories: AutomationRepository[]
  searchLoading: boolean
  searchResults: ProjectSearchResults | null
  sessionInfo: SessionInfo | null
  showArchitecture: boolean
  showDebugPanel: boolean
  showProject: boolean
  showSidebar: boolean
  sidebarView: DeveloperSidebarView
  showTerminal: boolean
  streamingSessionIds: Set<string>
  sidebarRef: RefObject<HTMLElement | null>
  onAssignRepository: (projectId: string) => void
  onArchiveSession: (sessionId: string) => void
  onMoveSession: (sessionId: string, projectId: string | null) => void
  onSearchProjects: (query: string) => Promise<ProjectRecord[]>
  onBlur: (event: FocusEvent<HTMLElement>) => void
  onChangeDirectory: (projectId: string) => void
  onCreateProject: () => void
  onCreateFolder: (parentId: string | null) => void
  onEditProject: (projectId: string) => void
  onMoveProject: (projectId: string, parentId: string | null) => void
  onCreatePersonalSession: () => void
  onRemoveProject: (projectId: string) => void
  onSearch: (query: string) => void
  onSelectPersonalSession: (sessionId: string) => void
  onSelectProject: (projectId: string) => void
  onSelectProjectSession: (projectId: string, sessionId: string) => void
  onShowFewer: () => void
  onShowMore: () => void
  onToggleArchitecture: () => void
  onToggleDebug: () => void
  onToggleEditor: () => void
  onTogglePreview: () => void
  onSelectSidebarView: (view: DeveloperSidebarView) => void
  onToggleTerminal: () => void
  onOpenSettings: () => void
}

export function DeveloperSidebars({
  activeProject,
  activeProjectId,
  activeSessionId,
  authLoading,
  fsNodes,
  hasMoreProjects,
  isMobile,
  personalSessions,
  previewOpen,
  projectListLimit,
  projects,
  projectsLoading,
  repositories,
  searchLoading,
  searchResults,
  sessionInfo,
  showArchitecture,
  showDebugPanel,
  showProject,
  showSidebar,
  sidebarView,
  showTerminal,
  streamingSessionIds,
  sidebarRef,
  onAssignRepository,
  onArchiveSession,
  onMoveSession,
  onSearchProjects,
  onBlur,
  onChangeDirectory,
  onCreateProject,
  onCreateFolder,
  onEditProject,
  onMoveProject,
  onCreatePersonalSession,
  onRemoveProject,
  onSearch,
  onSelectPersonalSession,
  onSelectProject,
  onSelectProjectSession,
  onShowFewer,
  onShowMore,
  onToggleArchitecture,
  onToggleDebug,
  onToggleEditor,
  onTogglePreview,
  onSelectSidebarView,
  onToggleTerminal,
  onOpenSettings,
}: DeveloperSidebarsProps) {
  return (
    <>
      {!isMobile && (
        <aside className="flex w-12 shrink-0 flex-col items-center gap-2 border-r bg-background px-1 py-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showSidebar && sidebarView === 'projects' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-9 w-9 rounded-md p-0"
                onClick={() => onSelectSidebarView('projects')}
                aria-label="Projects"
                aria-pressed={showSidebar && sidebarView === 'projects'}
              >
                <Folders className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Projects</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showSidebar && sidebarView === 'chats' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-9 w-9 rounded-md p-0"
                onClick={() => onSelectSidebarView('chats')}
                aria-label="Personal chats"
                aria-pressed={showSidebar && sidebarView === 'chats'}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Personal Chats</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={showTerminal ? 'secondary' : 'ghost'} size="sm" className="h-9 w-9 rounded-md p-0" onClick={onToggleTerminal} aria-label="Terminal">
                <TerminalIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Terminal</TooltipContent>
          </Tooltip>
          {(activeProjectId || activeProject) && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant={showProject ? 'secondary' : 'ghost'} size="sm" className="h-9 w-9 rounded-md p-0" onClick={onToggleEditor} aria-label="Editor">
                    <Code className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Editor</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={previewOpen ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-9 w-9 rounded-md p-0"
                    aria-label="Preview"
                    disabled={authLoading || projectsLoading}
                    onClick={onTogglePreview}
                  >
                    <Globe className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Preview</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showArchitecture ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-9 w-9 rounded-md p-0"
                    disabled={authLoading || projectsLoading}
                    aria-label="Architecture"
                    onClick={onToggleArchitecture}
                  >
                    <Boxes className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Architecture</TooltipContent>
              </Tooltip>
            </>
          )}
          <div className="flex-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showDebugPanel ? 'secondary' : 'ghost'}
                size="sm"
                className="h-9 w-9 rounded-md p-0"
                disabled={!activeSessionId}
                aria-label="Trajectory"
                onClick={onToggleDebug}
              >
                <Bug className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Trajectory</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 w-9 rounded-md p-0" aria-label="Settings" onClick={onOpenSettings}>
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Settings</TooltipContent>
          </Tooltip>
        </aside>
      )}

      {showSidebar && !isMobile && (
        <aside
          ref={sidebarRef}
          tabIndex={-1}
          onBlur={onBlur}
          className="w-64 overflow-hidden border-r outline-none shrink-0"
        >
          <ErrorBoundary name="Project sidebar" variant="section" className="h-full" resetKeys={[activeProjectId, activeSessionId, projects.length, personalSessions.length]}>
            <SessionSelector
              view={sidebarView}
              projects={projects}
              personalSessions={personalSessions}
              activeProjectId={activeProjectId}
              activeSessionId={activeSessionId}
              loading={projectsLoading}
              hasMoreProjects={hasMoreProjects}
              showFewerProjects={projects.length > projectListLimit}
              searchLoading={searchLoading}
              searchResults={searchResults}
              onSearch={onSearch}
              onSelectProject={onSelectProject}
              onSelectProjectSession={onSelectProjectSession}
              onSelectPersonalSession={onSelectPersonalSession}
              onArchiveSession={onArchiveSession}
              onMoveSession={onMoveSession}
              onSearchProjects={onSearchProjects}
              onNewPersonalSession={onCreatePersonalSession}
              onCreateProject={onCreateProject}
              onCreateFolder={onCreateFolder}
              onEditProject={onEditProject}
              showEditorModeStatus
              onMoveProject={onMoveProject}
              onRemoveProject={onRemoveProject}
              onChangeDirectory={onChangeDirectory}
              onAssignRepository={onAssignRepository}
              onShowMore={onShowMore}
              onShowFewer={onShowFewer}
              sessionInfo={sessionInfo}
              nodes={fsNodes}
              repositories={repositories}
              streamingSessionIds={streamingSessionIds}
            />
          </ErrorBoundary>
        </aside>
      )}
    </>
  )
}
