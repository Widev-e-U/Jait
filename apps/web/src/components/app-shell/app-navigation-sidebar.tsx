import { JAIT_PAGES, JAIT_PAGE_IDS } from '@jait/shared'
import { Brain, Calendar, CalendarDays, GitPullRequest, ListChecks, Mail, MessageSquare, MessagesSquare, UsersRound, Wifi, Workflow, Settings, type LucideIcon } from 'lucide-react'

import { ModeSidebar, type ModeSidebarItem, type SidebarAccount } from '@/components/app-shell/mode-sidebar'
import { useMessengerBadge } from '@/components/messenger/messenger-provider'
import type { AppView } from '@/lib/app-view'

interface AppNavigationSidebarProps {
  account: SidebarAccount
  currentView: AppView
  items?: ModeSidebarItem[]
  bottomItems?: ModeSidebarItem[]
  onNavigate: (view: AppView) => void
  onOpenSettings: () => void
}

export function AppNavigationSidebar({
  account,
  currentView,
  items = [],
  bottomItems,
  onNavigate,
  onOpenSettings,
}: AppNavigationSidebarProps) {
  const { count: messengerCount } = useMessengerBadge()
  // The catalog is also the navigation registry. Adding a routable page requires
  // its explanation and an icon; missing page metadata cannot silently ship.
  const icons: Record<AppView, LucideIcon> = {
    messenger: MessagesSquare, chat: MessageSquare, agents: UsersRound, threads: Workflow, pulls: GitPullRequest,
    todo: ListChecks, email: Mail, calendar: CalendarDays, memory: Brain, jobs: Calendar,
    network: Wifi, settings: Settings,
  }
  // Sidebar order follows the registry order in JAIT_PAGES.
  const navigationItems: ModeSidebarItem[] = JAIT_PAGE_IDS
    .filter((id) => id !== 'settings')
    .map((id) => ({ id, label: JAIT_PAGES[id].title, icon: icons[id],
      active: currentView === id, badge: id === 'messenger' ? messengerCount : undefined, onSelect: () => onNavigate(id) }))

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
