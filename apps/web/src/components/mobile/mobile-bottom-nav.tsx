import {
  Code,
  FolderOpen,
  GitBranch,
  MessageSquare,
  Terminal as TerminalIcon,
} from 'lucide-react'

import {
  getMobileProjectActiveTarget,
  type MobileProjectControlState,
  type MobileProjectTarget,
} from '@/lib/mobile-project-controls'

interface MobileBottomNavProps {
  activeProjectId: string | null
  changedFilesCount: number
  mobileProjectControlState: MobileProjectControlState
  showProject: boolean
  showSidebar: boolean
  showTerminal: boolean
  onChatClick: () => void
  onProjectTargetAction: (target: MobileProjectTarget) => void
}

interface NavButtonProps {
  label: string
  active: boolean
  disabled?: boolean
  badge?: string
  icon: typeof MessageSquare
  onClick: () => void
  /** Stretch the button to fill its share of the bar (default). */
  fill?: boolean
}

function NavButton({ label, active, disabled, badge, icon: Icon, onClick, fill = true }: NavButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`relative flex flex-col items-center justify-center gap-0.5 py-1 text-2xs transition-colors ${fill ? 'flex-1' : ''} ${
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <span
        className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
          active ? 'bg-secondary' : 'bg-transparent'
        }`}
      >
        <Icon className="h-[18px] w-[18px]" />
        {badge && (
          <span className="absolute right-1 top-0 z-10 min-w-[14px] rounded-full bg-primary px-1 text-2xs font-bold leading-[14px] text-primary-foreground">
            {badge}
          </span>
        )}
      </span>
      <span>{label}</span>
    </button>
  )
}

export function MobileBottomNav({
  activeProjectId,
  changedFilesCount,
  mobileProjectControlState,
  showProject,
  showSidebar,
  showTerminal,
  onChatClick,
  onProjectTargetAction,
}: MobileBottomNavProps) {
  // Chat is "active" when no project pane (files/git/editor) or terminal is
  // shown fullscreen — i.e. the chat workspace is the visible surface.
  const activeTarget = getMobileProjectActiveTarget(mobileProjectControlState)
  const chatActive = !showProject && !showTerminal && !showSidebar
  // Personal chats have no project, so the project panes (files/changes/editor)
  // are hidden entirely and the remaining actions spread across the bar.
  const isPersonalChat = !activeProjectId

  return (
    <nav
      className={`pointer-events-auto flex h-14 shrink-0 items-stretch border-t bg-background/95 backdrop-blur-lg safe-bottom ${
        isPersonalChat ? 'justify-between' : ''
      }`}
      aria-label="Mobile navigation"
    >
      <NavButton
        label="Chat"
        active={chatActive}
        icon={MessageSquare}
        onClick={onChatClick}
        fill={!isPersonalChat}
      />
      <NavButton
        label="Terminal"
        active={activeTarget === 'terminal'}
        icon={TerminalIcon}
        onClick={() => onProjectTargetAction('terminal')}
        fill={!isPersonalChat}
      />
      {!isPersonalChat && (
        <>
          <NavButton
            label="Files"
            active={activeTarget === 'files'}
            disabled={!activeProjectId}
            icon={FolderOpen}
            onClick={() => onProjectTargetAction('files')}
          />
          <NavButton
            label="Changes"
            active={activeTarget === 'git'}
            disabled={!activeProjectId}
            badge={changedFilesCount > 0 ? (changedFilesCount > 99 ? '99+' : String(changedFilesCount)) : undefined}
            icon={GitBranch}
            onClick={() => onProjectTargetAction('git')}
          />
          <NavButton
            label="Editor"
            active={activeTarget === 'editor'}
            disabled={!activeProjectId}
            icon={Code}
            onClick={() => onProjectTargetAction('editor')}
          />
        </>
      )}
    </nav>
  )
}