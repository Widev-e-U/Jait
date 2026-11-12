import { JAIT_PAGES, JAIT_PAGE_IDS } from '@jait/shared'
import { Brain, Calendar, CalendarDays, Cast, GitPullRequest, ListChecks, Mail, MessageSquare, MessagesSquare, UsersRound, Wifi, Settings, type LucideIcon } from 'lucide-react'

import { ModeSidebar, type ModeSidebarItem, type SidebarAccount } from '@/components/app-shell/mode-sidebar'
import { useMessengerBadge } from '@/components/messenger/messenger-provider'
import type { AppView } from '@/lib/app-view'

interface AppNavigationSidebarProps {
  account: SidebarAccount
  currentView: AppView
  items?: ModeSidebarItem[]
  bottomItems?: ModeSidebarItem[]
  screenShareActive?: boolean
  onNavigate: (view: AppView) => void
  onOpenSettings: () => void
  onToggleScreenShare?: () => void
}

export function AppNavigationSidebar({
  account,
  currentView,
  items = [],
  bottomItems,
  screenShareActive,
  onNavigate,
  onOpenSettings,
  onToggleScreenShare,
}: AppNavigationSidebarProps) {
  const { count: messengerCount } = useMessengerBadge()
  // The catalog is also the navigation registry. Adding a routable page requires
  // its explanation and an icon; missing page metadata cannot silently ship.
  const icons: Record<AppView, LucideIcon> = {
    messenger: MessagesSquare, chat: MessageSquare, agents: UsersRound, threads: MessagesSquare, pulls: GitPullRequest,
    todo: ListChecks, email: Mail, calendar: CalendarDays, memory: Brain, jobs: Calendar,
    network: Wifi, settings: Settings,
  }
  // Sidebar order follows the registry order in JAIT_PAGES.
  const navigationItems: ModeSidebarItem[] = JAIT_PAGE_IDS
    .filter((id) => id !== 'settings')
    .map((id) => ({ id, label: JAIT_PAGES[id].title, icon: icons[id],
      active: currentView === id, badge: id === 'messenger' ? messengerCount : undefined, onSelect: () => onNavigate(id) }))
  if (onToggleScreenShare) navigationItems.push({
    id: 'screenShare', label: 'Screen Share', icon: Cast, active: screenShareActive, onSelect: onToggleScreenShare,
  })

  return (
    <ModeSidebar
      account={account}
      navigationItems={navigationItems}
      items={items}
      bottomItems={bottomItems}
      onOpenSettings={onOpenSettings}
    />
  )
}
