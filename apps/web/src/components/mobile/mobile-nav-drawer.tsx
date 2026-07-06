import type { ReactNode } from 'react'
import {
  Boxes,
  Bug,
  Calendar,
  Code,
  FolderOpen,
  GitBranch,
  Globe,
  Mail,
  MessageSquare,
  Brain,
  Settings,
  Terminal as TerminalIcon,
  Wifi,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isMobileProjectTargetActive, type MobileProjectControlState, type MobileProjectTarget } from '@/lib/mobile-project-controls'
import type { AppView } from '@/lib/app-view'

interface NavItem {
  view: AppView
  label: string
  icon: typeof MessageSquare
}

const NAV_ITEMS: readonly NavItem[] = [
  { view: 'chat', label: 'Chat', icon: MessageSquare },
  { view: 'todo', label: 'Todo', icon: Boxes },
  { view: 'email', label: 'Email', icon: Mail },
  { view: 'memory', label: 'Memory', icon: Brain },
  { view: 'jobs', label: 'Jobs', icon: Calendar },
  { view: 'network', label: 'Network', icon: Wifi },
] as const

interface MobileNavDrawerProps {
  open: boolean
  onClose: () => void

  // Navigation
  currentView: AppView
  onNavigate: (view: AppView) => void

  // Projects / sessions sidebar
  sessionSelector: ReactNode

  // Project tools
  showProjectTools: boolean
  activeProjectId: string | null
  mobileProjectControlState: MobileProjectControlState
  onProjectTargetAction: (target: MobileProjectTarget) => void
  changedFilesCount: number
  previewOpen: boolean
  showArchitecture: boolean
  showDebugPanel: boolean
  showProject: boolean
  authLoading: boolean
  projectsLoading: boolean
  onToggleArchitecture: () => void
  onToggleDebugPanel: () => void
  onTogglePreview: () => void

  // Settings
  onOpenSettings: () => void
}

export function MobileNavDrawer({
  open,
  onClose,
  currentView,
  onNavigate,
  sessionSelector,
  showProjectTools,
  activeProjectId,
  mobileProjectControlState,
  onProjectTargetAction,
  changedFilesCount,
  previewOpen,
  showArchitecture,
  showDebugPanel,
  showProject,
  authLoading,
  projectsLoading,
  onToggleArchitecture,
  onToggleDebugPanel,
  onTogglePreview,
  onOpenSettings,
}: MobileNavDrawerProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px] transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={`fixed right-0 top-0 z-[61] flex h-[100dvh] w-[min(20rem,88vw)] flex-col border-l bg-background shadow-2xl transition-transform duration-300 ease-out safe-top safe-bottom ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
          <span className="text-sm font-semibold">Menu</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close menu">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable content */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* Nav items */}
          <nav className="shrink-0 border-b p-2">
            <div className="grid grid-cols-3 gap-1">
              {NAV_ITEMS.map(({ view, label, icon: Icon }) => (
                <button
                  key={view}
                  onClick={() => { onNavigate(view); onClose() }}
                  className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-2xs transition-colors ${
                    currentView === view
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                  aria-label={label}
                  aria-current={currentView === view ? 'page' : undefined}
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </button>
              ))}
              <button
                onClick={() => { onOpenSettings(); onClose() }}
                className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-2xs transition-colors ${
                  currentView === 'settings'
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
                aria-label="Settings"
                aria-current={currentView === 'settings' ? 'page' : undefined}
              >
                <Settings className="h-5 w-5" />
                <span>Settings</span>
              </button>
            </div>
          </nav>

          {/* Projects / sessions selector */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-9 shrink-0 items-center border-b px-3 text-xs font-medium text-foreground">
              <span>Projects & Chats</span>
            </div>
            <div className="min-h-0 flex-1">
              {sessionSelector}
            </div>
          </div>

          {/* Project tools */}
          {showProjectTools && (
            <div className="shrink-0 border-t p-2">
              <div className="mb-1.5 px-1 text-2xs font-medium text-muted-foreground">Project tools</div>
              <div className="grid grid-cols-4 gap-1">
                <DrawerToolButton
                  label="Terminal"
                  active={isMobileProjectTargetActive(mobileProjectControlState, 'terminal')}
                  onClick={() => onProjectTargetAction('terminal')}
                  icon={TerminalIcon}
                />
                {activeProjectId && (
                  <>
                    <DrawerToolButton
                      label="Files"
                      active={isMobileProjectTargetActive(mobileProjectControlState, 'files')}
                      onClick={() => onProjectTargetAction('files')}
                      icon={FolderOpen}
                    />
                    <DrawerToolButton
                      label="Changes"
                      active={isMobileProjectTargetActive(mobileProjectControlState, 'git')}
                      onClick={() => onProjectTargetAction('git')}
                      icon={GitBranch}
                      badge={changedFilesCount > 0 ? (changedFilesCount > 99 ? '99+' : String(changedFilesCount)) : undefined}
                    />
                    <DrawerToolButton
                      label="Editor"
                      active={isMobileProjectTargetActive(mobileProjectControlState, 'editor')}
                      onClick={() => onProjectTargetAction('editor')}
                      icon={Code}
                    />
                  </>
                )}
              </div>
              {showProject && activeProjectId && (
                <div className="mt-1.5 grid grid-cols-3 gap-1">
                  <DrawerToolButton
                    label="Preview"
                    active={previewOpen}
                    disabled={authLoading || projectsLoading}
                    onClick={onTogglePreview}
                    icon={Globe}
                  />
                  <DrawerToolButton
                    label="Arch"
                    active={showArchitecture}
                    disabled={authLoading || projectsLoading}
                    onClick={onToggleArchitecture}
                    icon={Boxes}
                  />
                  <DrawerToolButton
                    label="Debug"
                    active={showDebugPanel}
                    disabled={!showProject}
                    onClick={onToggleDebugPanel}
                    icon={Bug}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

function DrawerToolButton({
  label,
  active,
  disabled,
  onClick,
  icon: Icon,
  badge,
}: {
  label: string
  active: boolean
  disabled?: boolean
  onClick: () => void
  icon: typeof MessageSquare
  badge?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={`relative flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-2xs transition-colors ${
            active
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
          } ${disabled ? 'opacity-40' : ''}`}
        >
          <Icon className="h-5 w-5" />
          <span>{label}</span>
          {badge && (
            <span className="absolute right-1 top-0.5 z-10 min-w-[14px] rounded-full bg-primary px-1 text-2xs font-bold leading-[14px] text-primary-foreground">
              {badge}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}