import { MoreHorizontal } from 'lucide-react'
import { useState, type DragEvent, type ReactNode } from 'react'

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
  /** Drag handlers for items in the three-dot menu, so they can be dragged out into the rail. */
  menuDragProps?: (item: ModeSidebarItem) => {
    draggable: boolean
    onDragStart: (event: DragEvent) => void
    onDragOver: (event: DragEvent) => void
    onDrop: (event: DragEvent) => void
    onDragEnd: () => void
    dragging: boolean
    dropTarget: boolean
  } | undefined
}

/**
 * One vertical rail section: the first `visibleCount` items inline, the rest
 * behind a three-dot button. The vertical slot allocation lives in
 * rail-allocation.ts; this component only renders the decision.
 */
export function OverflowSidebarNavigation({ label, moreLabel, items, collapsed, renderItem, separated = false, visibleCount = items.length, menuDragProps }: OverflowSidebarNavigationProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuDragging, setMenuDragging] = useState(false)
  const shownItems = items.slice(0, visibleCount)
  const hiddenItems = items.slice(visibleCount)
  const hasActiveItem = hiddenItems.some(item => item.active)
  const badge = hiddenItems.reduce((sum, item) => sum + (item.badge || 0), 0)

  return (
    <nav
      aria-label={label}
      className={separated ? 'flex flex-col border-b pb-2' : 'flex flex-col py-2'}
    >
      <div className="flex min-h-0 flex-col gap-1 overflow-hidden">
        {shownItems.map(renderItem)}
        {hiddenItems.length > 0 && (
          // Non-modal so the rail underneath still receives drag events; the menu
          // stays open while dragging so items can be reordered inside it and the
          // drag source stays in the DOM for dragend.
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant={hasActiveItem ? 'secondary' : 'ghost'} size="sm"
                className={`h-9 w-full shrink-0 rounded-md ${collapsed ? 'justify-center px-0' : 'justify-start gap-3 px-3'}`}
                aria-label={moreLabel}>
                <span className="relative shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                  {badge > 0 && <span className="absolute -right-2 -top-1.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-background bg-primary/85 px-0.5 text-[9px] font-semibold leading-none tabular-nums text-primary-foreground">{badge > 99 ? '99+' : badge}</span>}
                </span>
                {!collapsed && <span>More</span>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" sideOffset={10} aria-label={moreLabel}
              onInteractOutside={(event) => { if (menuDragging) event.preventDefault() }}
              className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-60 overflow-y-auto">
              {hiddenItems.map(item => {
                const Icon = item.icon
                const drag = menuDragProps?.(item)
                return <DropdownMenuItem key={item.id} disabled={item.disabled} onSelect={item.onSelect}
                  {...(drag ? {
                    draggable: true,
                    onDragStart: (event: DragEvent) => { drag.onDragStart(event); setMenuDragging(true) },
                    onDragOver: drag.onDragOver,
                    onDrop: drag.onDrop,
                    onDragEnd: () => { drag.onDragEnd(); setMenuDragging(false); setMenuOpen(false) },
                  } : {})}
                  className={`gap-3 ${drag ? 'cursor-grab active:cursor-grabbing' : ''} ${item.active ? 'bg-secondary text-secondary-foreground' : ''} ${drag?.dragging ? 'opacity-40' : ''} ${drag?.dropTarget ? 'ring-2 ring-primary/60' : ''}`}
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
