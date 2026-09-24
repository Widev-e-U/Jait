import { Boxes, Bug, Code, FolderOpen, Folders, GitBranch, Globe, Terminal as TerminalIcon } from 'lucide-react'
import { useRef, type FocusEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

import { SessionSelector } from '@/components/chat'
import { ErrorBoundary } from '@/components/error-boundary'
import { ModeSidebar, type ModeSidebarItem } from '@/components/app-shell/mode-sidebar'
import type { SessionInfo } from '@/hooks/useChat'
import type { ProjectSearchResults, ProjectSession, ProjectRecord } from '@/hooks/useProjects'
import type { ActiveProjectState } from '@/lib/active-project'
import type { AutomationRepository } from '@/lib/automation-repositories'
import {
  DEVELOPER_SIDEBAR_MIN_WIDTH,
  clampDeveloperSidebarWidth,
  type DeveloperSidebarView,
} from '@/lib/developer-sidebar'

interface DeveloperSidebarsProps {
  changedFilesCount?: number
  activeProject: ActiveProjectState
  activeProjectId: string | null
  openSessionIds?: ReadonlySet<string>
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
  showProjectEditor: boolean
  showSidebar: boolean
  sidebarView: DeveloperSidebarView
  sidebarWidth: number
  showTerminal: boolean
  streamingSessionIds: Set<string>
  sidebarRef: RefObject<HTMLElement | null>
  onAssignRepository: (projectId: string) => void
  onArchiveSession: (sessionId: string) => void
  onOpenSessionInPanel: (sessionId: string, projectId: string | null) => void
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
  onSidebarWidthChange: (width: number) => void
  onToggleTerminal: () => void
  onOpenSettings: () => void
}

export function DeveloperSidebars({
  changedFilesCount = 0,
  activeProject,
  activeProjectId,
  activeSessionId,
  openSessionIds,
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
  showProjectEditor,
  showSidebar,
  sidebarView,
  sidebarWidth,
  showTerminal,
  streamingSessionIds,
  sidebarRef,
  onAssignRepository,
  onArchiveSession,
  onOpenSessionInPanel,
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
  onSidebarWidthChange,
  onToggleTerminal,
  onOpenSettings,
}: DeveloperSidebarsProps) {
  const resizeStartRef = useRef<{ pointerX: number; width: number } | null>(null)

  const setAndStoreSidebarWidth = (width: number) => {
    const nextWidth = clampDeveloperSidebarWidth(width, window.innerWidth)
    onSidebarWidthChange(nextWidth)
  }

  const finishSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    resizeStartRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    document.documentElement.classList.remove('is-dragging-col-resize')
  }

  const handleSidebarResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    setAndStoreSidebarWidth(sidebarWidth + (event.key === 'ArrowRight' ? 12 : -12))
  }

  return (
    <>
      {!isMobile && (
        <ModeSidebar
          items={[
            { id: 'projects', label: 'Projects & Chats', icon: Folders, active: showSidebar && sidebarView === 'projects', onSelect: () => onSelectSidebarView('projects') },
            ...((activeProjectId || activeProject) ? [
              { id: 'files', label: 'Files', icon: FolderOpen, active: showSidebar && sidebarView === 'files', onSelect: () => onSelectSidebarView('files') },
              { id: 'git', label: 'Source Control', icon: GitBranch, active: showSidebar && sidebarView === 'git', badge: changedFilesCount, onSelect: () => onSelectSidebarView('git') },
            ] : []),
            { id: 'terminal', label: 'Terminal', icon: TerminalIcon, active: showTerminal, onSelect: onToggleTerminal },
            ...((activeProjectId || activeProject) ? [
              { id: 'editor', label: 'Editor', icon: Code, active: showProject && showProjectEditor, onSelect: onToggleEditor },
              { id: 'preview', label: 'Preview', icon: Globe, active: previewOpen, disabled: authLoading || projectsLoading, onSelect: onTogglePreview },
              { id: 'architecture', label: 'Architecture', icon: Boxes, active: showArchitecture, disabled: authLoading || projectsLoading, onSelect: onToggleArchitecture },
            ] : []),
          ] satisfies ModeSidebarItem[]}
          bottomItems={[
            { id: 'trajectory', label: 'Trajectory', icon: Bug, active: showDebugPanel, disabled: !activeSessionId, onSelect: onToggleDebug },
          ]}
          onOpenSettings={onOpenSettings}
        />
      )}

      {showSidebar && sidebarView === 'projects' && !isMobile && (
        <aside
          ref={sidebarRef}
          tabIndex={-1}
          onBlur={onBlur}
          className="relative shrink-0 overflow-hidden border-r outline-none"
          style={{ width: sidebarWidth }}
        >
          <ErrorBoundary name="Project sidebar" variant="section" className="h-full" resetKeys={[activeProjectId, activeSessionId, projects.length, personalSessions.length]}>
            <SessionSelector
              projects={projects}
              personalSessions={personalSessions}
              activeProjectId={activeProjectId}
              activeSessionId={activeSessionId}
              openSessionIds={openSessionIds}
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
              onOpenSessionInPanel={onOpenSessionInPanel}
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
          <div
            role="separator"
            aria-label="Resize projects and chats panel"
            aria-orientation="vertical"
            aria-valuemin={DEVELOPER_SIDEBAR_MIN_WIDTH}
            aria-valuemax={clampDeveloperSidebarWidth(Number.POSITIVE_INFINITY, window.innerWidth)}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            className="absolute inset-y-0 right-0 z-20 w-3 translate-x-1/2 cursor-col-resize touch-none outline-none sash-handle"
            onKeyDown={handleSidebarResizeKeyDown}
            onPointerDown={(event) => {
              event.preventDefault()
              resizeStartRef.current = { pointerX: event.clientX, width: sidebarWidth }
              event.currentTarget.setPointerCapture(event.pointerId)
              document.documentElement.classList.add('is-dragging-col-resize')
            }}
            onPointerMove={(event) => {
              const start = resizeStartRef.current
              if (!start) return
              setAndStoreSidebarWidth(start.width + event.clientX - start.pointerX)
            }}
            onPointerUp={finishSidebarResize}
            onPointerCancel={finishSidebarResize}
            onLostPointerCapture={() => {
              resizeStartRef.current = null
              document.documentElement.classList.remove('is-dragging-col-resize')
            }}
          />
        </aside>
      )}
    </>
  )
}
