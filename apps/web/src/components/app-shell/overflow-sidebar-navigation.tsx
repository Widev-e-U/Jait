import { MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { ModeSidebarItem } from './mode-sidebar'

interface OverflowSidebarNavigationProps {
  label: string
  moreLabel: string
  items: ModeSidebarItem[]
  collapsed: boolean
  renderItem: (item: ModeSidebarItem) => ReactNode
  separated?: boolean
  /**
   * How many items fit inline. Decided centrally by ModeSidebar via
   * allocateRailSections so both sections share the rail's real height —
   * this section never hides items another section has room for.
   * Defaults to showing everything before the rail has been measured.
   */
  visibleCount?: number
}

/**
 * One vertical rail section: the first `visibleCount` items inline, the rest
 * behind a three-dot button. The vertical slot allocation lives in
 * rail-allocation.ts; this component only renders the decision.
 */
export function OverflowSidebarNavigation({ label, moreLabel, items, collapsed, renderItem, separated = false, visibleCount = items.length }: OverflowSidebarNavigationProps) {
  const shownItems = items.slice(0, visibleCount)
  const hiddenItems = items.slice(visibleCount)
  const hasActiveItem = hiddenItems.some(item => item.active)
  const badge = hiddenItems.reduce((sum, item) => sum + (item.badge || 0), 0)

  return (
    <nav
      aria-label={label}
      className={separated ? 'flex flex-col border-b pb-3' : 'flex flex-col py-3'}
    >
      <div className="flex min-h-0 flex-col gap-1 overflow-hidden">
        {shownItems.map(renderItem)}
        {hiddenItems.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant={hasActiveItem ? 'secondary' : 'ghost'} size="sm"
                className={`h-9 w-full shrink-0 rounded-md ${collapsed ? 'justify-center px-0' : 'justify-start gap-3 px-3'}`}
                aria-label={moreLabel}>
                <span className="relative shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                  {badge > 0 && <span className="absolute -right-2 -top-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-2xs font-bold leading-none tabular-nums text-primary-foreground">{badge > 99 ? '99+' : badge}</span>}
                </span>
                {!collapsed && <span>More</span>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" sideOffset={10} aria-label={moreLabel}
              className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-60 overflow-y-auto">
              {hiddenItems.map(item => {
                const Icon = item.icon
                return <DropdownMenuItem key={item.id} disabled={item.disabled} onSelect={item.onSelect}
                  className={`gap-3 ${item.active ? 'bg-secondary text-secondary-foreground' : ''}`}
                  aria-current={item.active ? 'page' : undefined}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1"><span className="block truncate">{item.label}</span>
                    {item.description && <span className="block text-2xs text-muted-foreground">{item.description}</span>}
                  </span>
                  {!!item.badge && <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-2xs font-bold leading-none tabular-nums text-primary-foreground">{item.badge > 99 ? '99+' : item.badge}</span>}
                </DropdownMenuItem>
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </nav>
  )
}
