import { JAIT_PAGES, JAIT_PAGE_IDS } from '@jait/shared'
import { useEffect } from 'react'
import { Brain, Calendar, CalendarDays, GitPullRequest, ListChecks, Mail, MessageSquare, MessagesSquare, UsersRound, Wifi, Workflow, Settings, type LucideIcon } from 'lucide-react'

import { ModeSidebar, type ModeSidebarItem, type SidebarAccount } from '@/components/app-shell/mode-sidebar'
import { useAuth } from '@/hooks/useAuth'
import { useMessengerBadge } from '@/components/messenger/messenger-provider'
import type { AppView } from '@/lib/app-view'

const NAV_ORDER_CACHE_KEY = 'jait:navigation-order'

function readCachedOrder(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(NAV_ORDER_CACHE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

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
  const { settings, updateSettings } = useAuth()
  // Default order follows the registry order in JAIT_PAGES; the user's saved order
  // wins, with unknown ids dropped and pages added later appended in registry order.
  const registryIds = JAIT_PAGE_IDS.filter((id) => id !== 'settings')
  // Settings load after first paint; the last known order is cached locally so
  // the sidebar renders in its final order immediately instead of visibly reshuffling.
  const savedOrder = settings?.navigation_order ?? readCachedOrder()
  useEffect(() => {
    if (!settings?.navigation_order) return
    try { localStorage.setItem(NAV_ORDER_CACHE_KEY, JSON.stringify(settings.navigation_order)) } catch { /* storage unavailable */ }
  }, [settings?.navigation_order])
  const saved = savedOrder.filter((id): id is AppView => (registryIds as string[]).includes(id))
  const orderedIds = [...new Set([...saved, ...registryIds])]
  const navigationItems: ModeSidebarItem[] = orderedIds
    .map((id) => ({ id, label: JAIT_PAGES[id].title, icon: icons[id],
      active: currentView === id, badge: id === 'messenger' ? messengerCount : undefined, onSelect: () => onNavigate(id) }))

  return (
    <ModeSidebar
      account={account}
      navigationItems={navigationItems}
      onReorderNavigation={(ids) => { void updateSettings({ navigation_order: ids }).catch(() => {}) }}
      items={items}
      bottomItems={bottomItems}
      onOpenSettings={onOpenSettings}
    />
  )
}
