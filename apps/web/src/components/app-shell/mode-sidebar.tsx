import { BarChart3, LogOut, Monitor, Moon, Settings, Sun, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UsageModal } from '@/components/app-shell/usage-modal'
import { useState } from 'react'
import type { ThemeMode } from '@/hooks/useAuth'

export interface ModeSidebarItem {
  id: string
  label: string
  description?: string
  icon: LucideIcon
  active?: boolean
  disabled?: boolean
  badge?: number
  onSelect: () => void
}

export interface SidebarAccount {
  username: string | null
  initial: string
  loading: boolean
  onLogin: () => void
  onLogout: () => void
  themeMode: ThemeMode
  onThemeModeChange: (mode: ThemeMode) => void
}

interface ModeSidebarProps {
  items: ModeSidebarItem[]
  navigationItems?: ModeSidebarItem[]
  bottomItems?: ModeSidebarItem[]
  header?: ReactNode
  account?: SidebarAccount
  settingsActive?: boolean
  onOpenSettings: () => void
}

export function ModeSidebar({ items, navigationItems = [], bottomItems = [], header, account, settingsActive, onOpenSettings }: ModeSidebarProps) {
  const [usageModalOpen, setUsageModalOpen] = useState(false)

  const renderItem = (item: ModeSidebarItem) => {
    const Icon = item.icon
    return (
      <Button
        key={item.id}
        variant={item.active ? 'secondary' : 'ghost'}
        size="sm"
        className={`${item.description ? 'h-12' : 'h-9'} w-full shrink-0 justify-start gap-3 rounded-md px-3`}
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
        <span className="min-w-0 flex-1 text-left"><span className="block truncate">{item.label}</span>{item.description && <span className="block truncate text-2xs font-normal text-muted-foreground">{item.description}</span>}</span>
      </Button>
    )
  }

  return (
    <aside aria-label="Workspace sidebar" className="flex w-56 shrink-0 flex-col overflow-hidden border-r bg-background px-2 py-3">
      {header && <div className="px-1 pb-3">{header}</div>}
      {navigationItems.length > 0 && <nav aria-label="Main navigation" className="flex flex-col gap-1 border-b pb-3">{navigationItems.map(renderItem)}</nav>}
      <nav aria-label="Workspace tools" className="flex min-h-0 flex-col gap-1 overflow-y-auto py-3">{items.map(renderItem)}</nav>
      <div className="flex-1" />
      <div className="flex flex-col gap-1 border-t pt-2">
        {bottomItems.map(renderItem)}
        {renderItem({ id: 'settings', label: 'Settings', icon: Settings, active: settingsActive, onSelect: onOpenSettings })}
        {account && (account.loading ? (
          <div className="h-10 animate-pulse rounded-md bg-muted" aria-label="Loading account" />
        ) : account.username ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-12 w-full justify-start gap-2 px-2" aria-label={`Account: ${account.username}`}>
                <Avatar className="h-7 w-7"><AvatarFallback className="text-xs">{account.initial}</AvatarFallback></Avatar>
                <span className="min-w-0 flex-1 truncate text-left text-sm">{account.username}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-52">
              <DropdownMenuLabel className="truncate">{account.username}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onOpenSettings}><Settings className="mr-2 h-4 w-4" />Settings</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setUsageModalOpen(true)}><BarChart3 className="mr-2 h-4 w-4" />Usage</DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5">
                <span className="text-xs text-muted-foreground">Theme</span>
                <div className="mt-1 flex gap-1">
                  {([['light', Sun], ['system', Monitor], ['dark', Moon]] as const).map(([mode, Icon]) => (
                    <Tooltip key={mode}>
                      <TooltipTrigger asChild>
                        <Button size="icon" variant={account.themeMode === mode ? 'secondary' : 'ghost'} className="h-7 w-7" onClick={() => account.onThemeModeChange(mode)} aria-label={`${mode} theme`}><Icon className="h-4 w-4" /></Button>
                      </TooltipTrigger>
                      <TooltipContent>{mode}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={account.onLogout}><LogOut className="mr-2 h-4 w-4" />Logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="ghost" className="h-10 w-full justify-start px-3" onClick={account.onLogin}>Sign in</Button>
        ))}
      </div>
      <UsageModal open={usageModalOpen} onOpenChange={setUsageModalOpen} />
    </aside>
  )
}
