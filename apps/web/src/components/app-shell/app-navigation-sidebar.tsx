import { Brain, Calendar, CalendarDays, Cast, GitPullRequest, ListChecks, Mail, MessageSquare, MessagesSquare, UsersRound, Wifi } from 'lucide-react'

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
  const navigationItems: ModeSidebarItem[] = viewMode === 'manager' ? [
    { id: 'agents', label: 'Agents', icon: UsersRound, active: currentView === 'agents', onSelect: () => onNavigate('agents') },
    { id: 'threads', label: 'Threads', icon: MessagesSquare, active: currentView === 'threads', onSelect: () => onNavigate('threads') },
  ] : [
    { id: 'chat', label: 'Chat', icon: MessageSquare, active: currentView === 'chat', onSelect: () => onNavigate('chat') },
    { id: 'pulls', label: 'Pull Requests', icon: GitPullRequest, active: currentView === 'pulls', onSelect: () => onNavigate('pulls') },
    { id: 'todo', label: 'Todo', icon: ListChecks, active: currentView === 'todo', onSelect: () => onNavigate('todo') },
    { id: 'email', label: 'Email', icon: Mail, active: currentView === 'email', onSelect: () => onNavigate('email') },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays, active: currentView === 'calendar', onSelect: () => onNavigate('calendar') },
    { id: 'memory', label: 'Memory', icon: Brain, active: currentView === 'memory', onSelect: () => onNavigate('memory') },
    { id: 'jobs', label: 'Jobs', icon: Calendar, active: currentView === 'jobs', onSelect: () => onNavigate('jobs') },
    { id: 'network', label: 'Network', icon: Wifi, active: currentView === 'network', onSelect: () => onNavigate('network') },
    ...(onToggleScreenShare ? [{ id: 'screenShare', label: 'Screen Share', icon: Cast, active: screenShareActive, onSelect: onToggleScreenShare }] : []),
  ]

  return (
    <ModeSidebar
      account={account}
      settingsActive={currentView === 'settings'}
      header={<ViewModeSelector mode={viewMode} onChange={onViewModeChange} />}
      navigationItems={navigationItems}
      items={items}
      bottomItems={bottomItems}
      onOpenSettings={onOpenSettings}
    />
  )
}
