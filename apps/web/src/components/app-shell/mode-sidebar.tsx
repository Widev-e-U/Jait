import { PanelLeftClose, PanelLeftOpen, Settings, type LucideIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export interface ModeSidebarItem {
  id: string
  label: string
  icon: LucideIcon
  active?: boolean
  disabled?: boolean
  badge?: number
  onSelect: () => void
}

interface ModeSidebarProps {
  items: ModeSidebarItem[]
  bottomItems?: ModeSidebarItem[]
  onOpenSettings: () => void
}

const EXPANDED_KEY = 'appSidebarExpanded'

export function ModeSidebar({ items, bottomItems = [], onOpenSettings }: ModeSidebarProps) {
  const [expanded, setExpanded] = useState(() => typeof window === 'undefined' || window.localStorage.getItem(EXPANDED_KEY) !== 'false')

  const toggleExpanded = () => {
    setExpanded((current) => {
      localStorage.setItem(EXPANDED_KEY, String(!current))
      return !current
    })
  }

  const renderItem = (item: ModeSidebarItem) => {
    const Icon = item.icon
    const button = (
      <Button
        key={item.id}
        variant={item.active ? 'secondary' : 'ghost'}
        size="sm"
        className={`h-9 w-full shrink-0 rounded-md transition-all duration-200 ${expanded ? 'justify-start gap-3 px-3' : 'justify-center px-0'}`}
        onClick={item.onSelect}
        disabled={item.disabled}
        aria-label={item.label}
        aria-pressed={item.active}
      >
        <span className="relative shrink-0">
          <Icon className="h-4 w-4" />
          {!!item.badge && (
            <span className="absolute -right-2 -top-2 z-10 min-w-[14px] rounded-full bg-primary px-1 text-2xs font-bold leading-[14px] text-primary-foreground">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </span>
        <span className={`overflow-hidden whitespace-nowrap text-left transition-all duration-200 ${expanded ? 'max-w-40 flex-1 opacity-100' : 'max-w-0 opacity-0'}`}>
          {item.label}
        </span>
      </Button>
    )
    if (expanded) return button
    return (
      <Tooltip key={item.id}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <aside
      aria-label="Workspace sidebar"
      className={`flex shrink-0 flex-col gap-2 overflow-hidden border-r bg-background px-1 py-2 transition-[width] duration-200 ease-in-out ${expanded ? 'w-48' : 'w-12'}`}
    >
      <div className="flex flex-col gap-1">{items.map(renderItem)}</div>
      <div className="flex-1" />
      <div className="flex flex-col gap-1">
        {bottomItems.map(renderItem)}
        {renderItem({ id: 'settings', label: 'Settings', icon: Settings, onSelect: onOpenSettings })}
        <Button
          variant="ghost"
          size="sm"
          className={`h-9 w-full rounded-md ${expanded ? 'justify-start gap-3 px-3' : 'justify-center px-0'}`}
          onClick={toggleExpanded}
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={expanded}
        >
          {expanded ? <PanelLeftClose className="h-4 w-4 shrink-0" /> : <PanelLeftOpen className="h-4 w-4 shrink-0" />}
          {expanded && <span>Collapse sidebar</span>}
        </Button>
      </div>
    </aside>
  )
}
