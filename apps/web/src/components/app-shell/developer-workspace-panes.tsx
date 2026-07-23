import { ExternalLink, Loader2, Maximize2, Minimize2, X } from 'lucide-react'
import type { RefObject } from 'react'

import { ErrorBoundary } from '@/components/error-boundary'
import { ProjectPanel } from '@/components/project'
import { TerminalTabs, TerminalView } from '@/components/terminal'
import type { ProviderId } from '@/lib/agents-api'
import type { ActiveProjectState } from '@/lib/active-project'

interface DeveloperWorkspacePanesProps {
  activeProject: ActiveProjectState
  activeProjectFileId: string | null
  activeProjectRoot: string | null
  activeSessionId: string | null
  activeTerminalId: string | null
  architectureDiagram: string | null
  architectureGenerating: boolean
  architectureRequest: unknown
  changedPaths: string[]
  chatCollapsed: boolean
  chatProvider: ProviderId
  cliModel: string | null
  currentView: string
  devPreviewTarget: string | null
  fsWatcherPayload: unknown
  fsWatcherVersion: number
  isMobile: boolean
  mobileTreeTab: 'files' | 'git'
  previewProjectRoot: string | null
  projectFiles: unknown[]
  projectPreviewRequest: unknown
  projectRef: RefObject<any>
  projectRestoreRef: RefObject<any>
  projectStateReady: boolean
  projectTabsState: unknown
  projectTerminals: unknown[]
  showDesktopProject: boolean
  showMobileProjectFullscreen: boolean
  showMobileTerminalFullscreen: boolean
  showProjectEditor: boolean
  showProjectTree: boolean
  showTerminal: boolean
  sourceControlRefreshSignal: number
  terminalColumnWidth: number
  terminalFullscreen: boolean
  terminalHeight: number
  terminalHeightBeforeFullscreenRef: RefObject<number>
  terminalShells: unknown[]
  terminalViewRef: RefObject<any>
  token: string | null
  viewMode: string
  automationSelectedThread: unknown
  onActiveProjectFileChange: (fileId: string | null) => void
  onApplyDiff: (filePath: string, resultContent: string) => void | Promise<void>
  onArchitectureOpenChange: (open: boolean) => void
  onArchitectureRenderResult: (result: any) => void
  onAvailableFilesChange: (files: any) => void
  onCloseTerminal: () => void
  onCreateTerminal: (shell?: string) => void
  onDetachTerminal: (terminalId: string) => void
  onFileDrop: (files: FileList | File[]) => void
  onGenerateArchitecture: () => void
  onKillTerminal: (terminalId: string) => void
  onPreviewOpenChange: (state: { open: boolean; target: string | null }) => void
  onReferenceFile: (file: any) => void
  onReferenceFileSelection: (file: any, selection: string, startLine: number, endLine: number) => void
  onReferencePreviewElement: (element: any) => void
  onReferenceTerminalSelection: (terminalId: string, selection: string, projectRoot?: string | null, startLine?: number, endLine?: number) => void
  onSetChatCollapsed: (collapsed: boolean) => void
  onSetMobileTreeTab: (tab: 'files' | 'git') => void
  onSetTerminalFullscreen: (fullscreen: boolean) => void
  onSetTerminalHeight: (height: number) => void
  onTabsStateChange: (state: any) => void
  onTerminalColumnDragStart: (event: React.MouseEvent<HTMLDivElement>) => void
  onTerminalDragStart: (event: React.MouseEvent<HTMLDivElement>) => void
  onTerminalSelect: (terminalId: string) => void
  onToggleProjectEditor: () => void
  onToggleProjectTree: () => void
}

export function DeveloperWorkspacePanes({
  activeProject,
  activeProjectFileId,
  activeProjectRoot,
  activeSessionId,
  activeTerminalId,
  architectureDiagram,
  architectureGenerating,
  architectureRequest,
  changedPaths,
  chatCollapsed,
  chatProvider,
  cliModel,
  currentView,
  devPreviewTarget,
  fsWatcherPayload,
  fsWatcherVersion,
  isMobile,
  mobileTreeTab,
  previewProjectRoot,
  projectFiles,
  projectPreviewRequest,
  projectRef,
  projectRestoreRef,
  projectStateReady,
  projectTabsState,
  projectTerminals,
  showDesktopProject,
  showMobileProjectFullscreen,
  showMobileTerminalFullscreen,
  showProjectEditor,
  showProjectTree,
  showTerminal,
  sourceControlRefreshSignal,
  terminalColumnWidth,
  terminalFullscreen,
  terminalHeight,
  terminalHeightBeforeFullscreenRef,
  terminalShells,
  terminalViewRef,
  token,
  viewMode,
  automationSelectedThread,
  onActiveProjectFileChange,
  onApplyDiff,
  onArchitectureOpenChange,
  onArchitectureRenderResult,
  onAvailableFilesChange,
  onCloseTerminal,
  onCreateTerminal,
  onDetachTerminal,
  onFileDrop,
  onGenerateArchitecture,
  onKillTerminal,
  onPreviewOpenChange,
  onReferenceFile,
  onReferenceFileSelection,
  onReferencePreviewElement,
  onReferenceTerminalSelection,
  onSetChatCollapsed,
  onSetMobileTreeTab,
  onSetTerminalFullscreen,
  onSetTerminalHeight,
  onTabsStateChange,
  onTerminalColumnDragStart,
  onTerminalDragStart,
  onTerminalSelect,
  onToggleProjectEditor,
  onToggleProjectTree,
}: DeveloperWorkspacePanesProps) {
  const hasManagerThread = Boolean(automationSelectedThread)
  const shouldShowDesktopPanes = (viewMode === 'developer' && currentView === 'chat' && !isMobile && (showDesktopProject || showTerminal))
    || (viewMode === 'manager' && hasManagerThread && showDesktopProject)
  const shouldShowProject = (viewMode === 'developer' || (viewMode === 'manager' && hasManagerThread)) && showDesktopProject
  const shouldShowMobileProject = (viewMode === 'developer' || (viewMode === 'manager' && hasManagerThread)) && showMobileProjectFullscreen

  const renderProjectPanel = (mobile = false) => activeProject?.opening ? (
    <div className={mobile ? 'flex h-full min-h-0 items-center justify-center' : 'flex min-h-0 flex-1 items-center justify-center'}>
      <div className="flex max-w-full items-center gap-2 px-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <span className="truncate">Opening {activeProject.projectRoot}…</span>
      </div>
    </div>
  ) : (
    <ErrorBoundary
      name="Editor project"
      variant="section"
      className={mobile ? 'h-full min-h-0' : 'flex-1 min-h-0'}
      resetKeys={[activeProject?.projectRoot, showProjectTree, showProjectEditor, mobileTreeTab]}
    >
      <ProjectPanel
        ref={projectRef}
        autoOpenRemotePath={activeProject?.projectRoot ?? null}
        surfaceId={activeProject?.surfaceId ?? null}
        projectNodeId={activeProject?.nodeId ?? null}
        files={projectFiles as any}
        activeFileId={activeProjectFileId}
        onActiveFileChange={onActiveProjectFileChange}
        onFileDrop={onFileDrop}
        onReferenceFile={onReferenceFile}
        onReferenceSelection={onReferenceFileSelection}
        onReferencePreviewElement={onReferencePreviewElement}
        onAvailableFilesChange={onAvailableFilesChange}
        showTree={showProjectTree}
        showEditor={showProjectEditor}
        onToggleTree={onToggleProjectTree}
        onToggleEditor={onToggleProjectEditor}
        treeTab={mobile ? mobileTreeTab : undefined}
        onTreeTabChange={mobile ? onSetMobileTreeTab : undefined}
        changedPaths={changedPaths}
        fsWatcherVersion={fsWatcherVersion}
        fsWatcherPayload={fsWatcherPayload as any}
        sourceControlRefreshSignal={sourceControlRefreshSignal}
        isMobile={mobile || undefined}
        savedTabsState={projectTabsState as any}
        stateReady={projectStateReady}
        previewRequest={projectPreviewRequest as any}
        onTabsStateChange={onTabsStateChange}
        onPreviewOpenChange={onPreviewOpenChange}
        previewSessionId={activeSessionId}
        previewToken={token}
        previewProjectRoot={previewProjectRoot}
        previewInitialTarget={devPreviewTarget}
        architectureDiagram={architectureDiagram}
        architectureGenerating={architectureGenerating}
        architectureRequest={architectureRequest as any}
        onArchitectureOpenChange={onArchitectureOpenChange}
        onArchitectureRenderResult={onArchitectureRenderResult as any}
        onGenerateArchitecture={onGenerateArchitecture}
        onApplyDiff={onApplyDiff as any}
        provider={chatProvider}
        cliModel={cliModel}
        onMaxCollapsedChange={mobile ? undefined : onSetChatCollapsed}
        restoreRef={mobile ? undefined : projectRestoreRef}
      />
    </ErrorBoundary>
  )

  const renderTerminalBody = () => activeTerminalId ? (
    <ErrorBoundary name="Terminal" variant="section" className="flex-1 min-h-0" resetKeys={[activeTerminalId, activeProjectRoot]}>
      <TerminalView
        ref={terminalViewRef}
        terminalId={activeTerminalId}
        className="flex-1 min-h-0"
        token={token}
        projectRoot={activeProjectRoot ?? undefined}
        onReferenceSelection={onReferenceTerminalSelection}
      />
    </ErrorBoundary>
  ) : (
    <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
      <button
        onClick={() => onCreateTerminal()}
        className="hover:text-foreground transition-colors"
      >
        + New Terminal
      </button>
    </div>
  )

  return (
    <>
      {shouldShowDesktopPanes && (
        <div
          className={`relative flex min-h-0 flex-col ${!showDesktopProject && showTerminal ? 'flex-1 min-w-0' : chatCollapsed ? 'flex-1 min-w-0' : 'shrink-0'}`}
          style={!showDesktopProject && showTerminal ? { width: terminalColumnWidth, maxWidth: '70vw' } : undefined}
        >
          {!showDesktopProject && showTerminal && (
            <div
              onMouseDown={onTerminalColumnDragStart}
              className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize hover:bg-primary/30 transition-colors z-10"
            />
          )}
          {shouldShowProject && (
            <div className="flex min-h-0 flex-1">
              {renderProjectPanel()}
            </div>
          )}
          {viewMode === 'developer' && showTerminal && !isMobile && currentView === 'chat' && (
            <div className={`flex min-h-0 flex-col bg-background ${terminalFullscreen ? 'absolute inset-0 z-20 border-r' : `relative border-r border-t ${showDesktopProject ? 'shrink-0' : 'flex-1'}`}`} style={terminalFullscreen || !showDesktopProject ? undefined : { height: terminalHeight }}>
              {!terminalFullscreen && (
                <div
                  onMouseDown={onTerminalDragStart}
                  className="absolute inset-x-0 top-0 h-1.5 cursor-row-resize hover:bg-primary/30 transition-colors z-20"
                />
              )}
              <div className="relative shrink-0">
                <TerminalTabs
                  terminals={projectTerminals as any}
                  activeTerminalId={activeTerminalId}
                  onSelect={onTerminalSelect}
                  onCreate={(shell) => onCreateTerminal(shell)}
                  onKill={onKillTerminal}
                  onDetach={onDetachTerminal}
                  availableShells={terminalShells as any}
                />
                <div className="absolute right-0 top-0 bottom-px flex items-center gap-1 pr-2 pl-3 bg-background z-[9]">
                  {showDesktopProject && (
                    <button
                      onClick={() => {
                        if (terminalFullscreen) {
                          onSetTerminalFullscreen(false)
                          onSetTerminalHeight(terminalHeightBeforeFullscreenRef.current)
                        } else {
                          terminalHeightBeforeFullscreenRef.current = terminalHeight
                          onSetTerminalFullscreen(true)
                        }
                      }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={terminalFullscreen ? 'Exit fullscreen' : 'Fullscreen terminal'}
                    >
                      {terminalFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </button>
                  )}
                  <button
                    onClick={() => { if (activeTerminalId) onDetachTerminal(activeTerminalId) }}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Open terminal in new window"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button
                    onClick={onCloseTerminal}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Close terminal"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {renderTerminalBody()}
            </div>
          )}
        </div>
      )}

      {showMobileTerminalFullscreen && (
        <section className="flex flex-1 min-h-0 flex-col overflow-hidden border-b bg-background pt-16">
          <div className="relative shrink-0 border-b">
            <TerminalTabs
              terminals={projectTerminals as any}
              activeTerminalId={activeTerminalId}
              onSelect={onTerminalSelect}
              onCreate={(shell) => onCreateTerminal(shell)}
              onKill={onKillTerminal}
              availableShells={terminalShells as any}
            />
            <button
              onClick={onCloseTerminal}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close terminal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {renderTerminalBody()}
        </section>
      )}

      {shouldShowMobileProject && (
        <section className={`flex-1 min-h-0 overflow-hidden border-b bg-background ${viewMode === 'manager' ? '' : 'pt-16'}`}>
          {renderProjectPanel(true)}
        </section>
      )}
    </>
  )
}
