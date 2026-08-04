import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { EllipsisVertical } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface ProgressiveNavItem {
  id: string
  label: string
  /** Optional shorter label shown in the compact button (e.g. "PRs"). */
  shortLabel?: string
  icon: React.ComponentType<{ className?: string }>
  active: boolean
  onSelect: () => void
}

interface ProgressiveNavProps {
  items: ProgressiveNavItem[]
  /** Available width (px) for the inline nav buttons, measured by the parent. */
  availableWidth: number
  /** Ref attached to the live nav element so the parent can measure its start position. */
  navRef?: React.RefObject<HTMLElement | null>
  className?: string
  style?: React.CSSProperties
}

function NavButton({ item }: { item: ProgressiveNavItem }) {
  const Icon = item.icon
  return (
    <Button
      variant={item.active ? 'secondary' : 'ghost'}
      size="sm"
      className="h-8 shrink-0 rounded-lg gap-1.5 px-2 text-xs whitespace-nowrap"
      onClick={item.onSelect}
      aria-label={item.label}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{item.shortLabel ?? item.label}</span>
    </Button>
  )
}

/**
 * Greedily count how many nav items fit within `availableWidth`, given each
 * item's cumulative end offset (including inter-item gaps). Items overflow
 * right-to-left so the leftmost items always stay visible.
 */
export function computeVisibleCount(itemEnds: number[], availableWidth: number): number {
  if (itemEnds.length === 0) return 0
  for (let i = 0; i < itemEnds.length; i++) {
    if (itemEnds[i] > availableWidth) return i
  }
  return itemEnds.length
}

/**
 * ProgressiveNav renders nav items inline and gradually overflows them into a
 * "⋯" dropdown as the available width shrinks. The leftmost items always stay
 * visible; items are moved into the menu one at a time instead of collapsing
 * all at once.
 */
export function ProgressiveNav({ items, availableWidth, navRef, className, style }: ProgressiveNavProps) {
  // Hidden off-screen container that lays out every item so we can measure each
  // button's end position (accounting for the same gap as the live nav).
  const measureRef = useRef<HTMLDivElement>(null)
  const [itemEnds, setItemEnds] = useState<number[]>([])

  useEffect(() => {
    const measure = measureRef.current
    if (!measure) return
    const measureWidths = () => {
      setItemEnds(
        Array.from(measure.children).map((el) => {
          const node = el as HTMLElement
          return node.offsetLeft + node.offsetWidth
        }),
      )
    }
    measureWidths()
    const ro = new ResizeObserver(measureWidths)
    ro.observe(measure)
    return () => ro.disconnect()
  }, [items])

  // Greedily fit items from the left until the next button would exceed the
  // available width. Anything past the cutoff lives in the overflow menu.
  const visibleCount = itemEnds.length === items.length
    ? computeVisibleCount(itemEnds, availableWidth)
    : 0

  const visibleItems = items.slice(0, visibleCount)
  const overflowItems = items.slice(visibleCount)

  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)} style={style}>
      {/* Left overflow (⋯) menu */}
      <div className="shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 w-9 shrink-0 p-0" aria-label="Open navigation menu">
              <EllipsisVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Navigate</DropdownMenuLabel>
            {overflowItems.map((item) => (
              <DropdownMenuItem key={item.id} onSelect={item.onSelect}>
                <item.icon className="h-4 w-4 mr-2" />
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Live nav — only the items that fit are rendered inline. */}
      <nav ref={navRef} className="flex min-w-0 items-center gap-1 overflow-hidden">
        {visibleItems.map((item) => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <NavButton item={item} />
            </TooltipTrigger>
            <TooltipContent side="bottom">{item.label}</TooltipContent>
          </Tooltip>
        ))}

        {/* Off-screen measuring container (same gap, same buttons). */}
        <div
          ref={measureRef}
          aria-hidden="true"
          inert
          className="pointer-events-none absolute left-[-9999px] top-0 flex items-center gap-1"
        >
          {items.map((item) => (
            <NavButton key={item.id} item={{ ...item, onSelect: () => {} }} />
          ))}
        </div>
      </nav>
    </div>
  )
}
