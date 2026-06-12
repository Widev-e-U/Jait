import { Code, FolderOpen, GitBranch, MessageSquare, PanelLeftClose, PanelLeftOpen, Terminal as TerminalIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isMobileProjectTargetActive, type MobileProjectControlState, type MobileProjectTarget } from '@/lib/mobile-project-controls'

interface MobileProjectToolbarControlsProps {
  activeProjectId: string | null
  changedFilesCount: number
  isManagerThread: boolean
  mobileProjectControlState: MobileProjectControlState
  mobileProjectMenuActive: boolean
  showProject: boolean
  showSidebar: boolean
  showTerminal: boolean
  onChatClick: () => void
  onToggleSidebar: () => void
  onProjectTargetAction: (target: MobileProjectTarget) => void
}

export function MobileProjectToolbarControls({
  activeProjectId,
  changedFilesCount,
  isManagerThread,
  mobileProjectControlState,
  mobileProjectMenuActive,
  showProject,
  showSidebar,
  showTerminal,
  onChatClick,
  onToggleSidebar,
  onProjectTargetAction,
}: MobileProjectToolbarControlsProps) {
  return (
    <div
      className="flex flex-col items-center gap-1 rounded-lg border bg-background/85 px-1.5 py-1.5 shadow-lg backdrop-blur-lg"
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
    >
      {!isManagerThread && (
        <>
          <Tooltip><TooltipTrigger asChild>
            <Button variant={!showProject && !showTerminal && !showSidebar ? 'secondary' : 'ghost'} size="sm" className="h-10 w-10 shrink-0 rounded-lg p-0" onClick={onChatClick} aria-label="Chat">
              <MessageSquare className="h-5 w-5" />
            </Button>
          </TooltipTrigger><TooltipContent side="left">Chat</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Button variant={mobileProjectMenuActive ? 'secondary' : 'ghost'} size="sm" className="h-9 w-9 shrink-0 rounded-lg p-0" onClick={onToggleSidebar} aria-label="Projects">
              {showSidebar ? <PanelLeftClose className="h-4 w-4 rotate-90" /> : <PanelLeftOpen className="h-4 w-4 rotate-90" />}
            </Button>
          </TooltipTrigger><TooltipContent side="left">Projects</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Button variant={isMobileProjectTargetActive(mobileProjectControlState, 'terminal') ? 'secondary' : 'ghost'} size="sm" className="h-10 w-10 shrink-0 rounded-lg p-0" onClick={() => onProjectTargetAction('terminal')} aria-label="Terminal">
              <TerminalIcon className="h-5 w-5" />
            </Button>
          </TooltipTrigger><TooltipContent side="left">Terminal</TooltipContent></Tooltip>
        </>
      )}
      {activeProjectId && (
        <>
          <Tooltip><TooltipTrigger asChild>
            <Button variant={isMobileProjectTargetActive(mobileProjectControlState, 'files') ? 'secondary' : 'ghost'} size="sm" className="h-10 w-10 shrink-0 rounded-lg p-0" onClick={() => onProjectTargetAction('files')} aria-label="Files">
              <FolderOpen className="h-5 w-5" />
            </Button>
          </TooltipTrigger><TooltipContent side="left">Files</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Button variant={isMobileProjectTargetActive(mobileProjectControlState, 'git') ? 'secondary' : 'ghost'} size="sm" className="relative h-10 w-10 shrink-0 rounded-lg p-0" onClick={() => onProjectTargetAction('git')} aria-label="Changes">
              <GitBranch className="h-5 w-5" />
              {changedFilesCount > 0 && <span className="absolute -right-1 -top-1 z-10 min-w-[14px] rounded-full bg-primary px-1 text-2xs font-bold leading-[14px] text-primary-foreground">{changedFilesCount > 99 ? '99+' : changedFilesCount}</span>}
            </Button>
          </TooltipTrigger><TooltipContent side="left">Changes</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Button variant={isMobileProjectTargetActive(mobileProjectControlState, 'editor') ? 'secondary' : 'ghost'} size="sm" className="h-10 w-10 shrink-0 rounded-lg p-0" onClick={() => onProjectTargetAction('editor')} aria-label="Editor">
              <Code className="h-5 w-5" />
            </Button>
          </TooltipTrigger><TooltipContent side="left">Editor</TooltipContent></Tooltip>
        </>
      )}
    </div>
  )
}
