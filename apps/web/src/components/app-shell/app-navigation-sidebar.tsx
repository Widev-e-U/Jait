import { JAIT_PAGES, JAIT_PAGE_IDS } from '@jait/shared'
import { Brain, Calendar, CalendarDays, Cast, Code, GitPullRequest, ListChecks, Mail, MessageSquare, MessagesSquare, UsersRound, Wifi, Workflow, Settings, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ViewModeSelector, type ViewMode } from '@/components/chat/view-mode-selector'
import { ModeSidebar, type ModeSidebarItem, type SidebarAccount } from '@/components/app-shell/mode-sidebar'
import type { AppView } from '@/lib/app-view'

interface AppNavigationSidebarProps {
  account: SidebarAccount
  currentView: AppView
  viewMode: ViewMode
  items?: ModeSidebarItem[]
  bottomItems?: ModeSidebarItem[]
  screenShareActive?: boolean
  onNavigate: (view: AppView) => void
  onViewModeChange: (mode: ViewMode) => void
  onOpenSettings: () => void
  onToggleScreenShare?: () => void
}

export function AppNavigationSidebar({
  account,
  currentView,
  viewMode,
  items = [],
  bottomItems,
  screenShareActive,
  onNavigate,
  onViewModeChange,
  onOpenSettings,
  onToggleScreenShare,
}: AppNavigationSidebarProps) {
  // The catalog is also the navigation registry. Adding a routable page requires
  // its explanation and an icon; missing page metadata cannot silently ship.
  const icons: Record<AppView, LucideIcon> = {
    chat: MessageSquare, agents: UsersRound, threads: MessagesSquare, pulls: GitPullRequest,
    todo: ListChecks, email: Mail, calendar: CalendarDays, memory: Brain, jobs: Calendar,
    network: Wifi, settings: Settings,
  }
  const navigationItems: ModeSidebarItem[] = JAIT_PAGE_IDS
    .filter((id) => id !== 'settings' && JAIT_PAGES[id].mode === viewMode)
    .map((id) => ({ id, label: JAIT_PAGES[id].title, icon: icons[id],
      active: currentView === id, onSelect: () => onNavigate(id) }))
  if (viewMode === 'developer' && onToggleScreenShare) navigationItems.push({
    id: 'screenShare', label: 'Screen Share', icon: Cast, active: screenShareActive, onSelect: onToggleScreenShare,
  })

  return (
    <ModeSidebar
      account={account}
      header={(collapsed) => collapsed ? (
        <>{([['developer', Code], ['manager', Workflow]] as const).map(([mode, Icon]) => (
          <Tooltip key={mode}>
            <TooltipTrigger asChild>
              <Button variant={viewMode === mode ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9" aria-label={`${mode} mode`} aria-pressed={viewMode === mode} onClick={() => onViewModeChange(mode)}>
                <Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{mode === 'developer' ? 'Developer' : 'Manager'}</TooltipContent>
          </Tooltip>
        ))}</>
      ) : <ViewModeSelector mode={viewMode} onChange={onViewModeChange} />}
      navigationItems={navigationItems}
      items={items}
      bottomItems={bottomItems}
      onOpenSettings={onOpenSettings}
    />
  )
}
