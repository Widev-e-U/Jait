import { BarChart3, LogIn, LogOut, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UsageModal } from '@/components/app-shell/usage-modal'
import { JaitIcon } from '@/components/icons/model-icons'
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
  updateControl?: (collapsed: boolean) => ReactNode
  themeMode: ThemeMode
  onThemeModeChange: (mode: ThemeMode) => void
}

interface ModeSidebarProps {
  items: ModeSidebarItem[]
  navigationItems?: ModeSidebarItem[]
  bottomItems?: ModeSidebarItem[]
  header?: (collapsed: boolean) => ReactNode
  account?: SidebarAccount
  onOpenSettings: () => void
}

export function ModeSidebar({ items, navigationItems = [], bottomItems = [], header, account, onOpenSettings }: ModeSidebarProps) {
  const [usageModalOpen, setUsageModalOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem('jait.navigationSidebarCollapsed') === 'true')

  useEffect(() => {
    window.localStorage.setItem('jait.navigationSidebarCollapsed', String(collapsed))
  }, [collapsed])

  const renderItem = (item: ModeSidebarItem) => {
    const Icon = item.icon
    const button = (
      <Button
        key={item.id}
        variant={item.active ? 'secondary' : 'ghost'}
        size="sm"
        className={`${!collapsed && item.description ? 'h-12' : 'h-9'} w-full shrink-0 ${collapsed ? 'justify-center px-0' : 'justify-start gap-3 px-3'} rounded-md`}
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
        {!collapsed && <span className="min-w-0 flex-1 text-left"><span className="block truncate">{item.label}</span>{item.description && <span className="block truncate text-2xs font-normal text-muted-foreground">{item.description}</span>}</span>}
      </Button>
    )
    return collapsed ? <Tooltip key={item.id}><TooltipTrigger asChild>{button}</TooltipTrigger><TooltipContent side="right">{item.label}</TooltipContent></Tooltip> : button
  }

  return (
    <aside aria-label="Workspace sidebar" className={`flex ${collapsed ? 'w-14' : 'w-56'} shrink-0 flex-col overflow-hidden border-r bg-background px-2 py-3 transition-[width] duration-150 ease-out motion-reduce:transition-none`}>
      <div className={`mb-3 flex ${collapsed ? 'flex-col items-center gap-1' : 'items-center justify-between'} px-1`}>
        {collapsed ? (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCollapsed(false)} aria-label="Expand sidebar"><PanelLeftOpen className="h-4 w-4" /></Button>
        ) : <JaitIcon size={22} className="shrink-0" />}
        {collapsed ? <JaitIcon size={22} className="shrink-0" /> : (
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar"><PanelLeftClose className="h-4 w-4" /></Button>
        )}
      </div>
      {header && <div className={collapsed ? 'flex flex-col items-center gap-1 pb-3' : 'px-1 pb-3'}>{header(collapsed)}</div>}
      {navigationItems.length > 0 && <nav aria-label="Main navigation" className="flex flex-col gap-1 border-b pb-3">{navigationItems.map(renderItem)}</nav>}
      <nav aria-label="Workspace tools" className="flex min-h-0 flex-col gap-1 overflow-y-auto py-3">{items.map(renderItem)}</nav>
      <div className="flex-1" />
      <div className="flex flex-col gap-1 border-t pt-2">
        {account?.updateControl?.(collapsed)}
        {bottomItems.map(renderItem)}
        {account && (account.loading ? (
          <div className="h-10 animate-pulse rounded-md bg-muted" aria-label="Loading account" />
        ) : account.username ? (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className={`h-12 w-full ${collapsed ? 'justify-center px-0' : 'justify-start gap-3 px-3'}`} aria-label="Account menu">
                    <Avatar className="h-7 w-7 shrink-0"><AvatarFallback className="text-xs">{account.initial}</AvatarFallback></Avatar>
                    {!collapsed && <span className="min-w-0 truncate text-left">{account.username}</span>}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">{account.username}</TooltipContent>}
            </Tooltip>
            <DropdownMenuContent side={collapsed ? "right" : "top"} align={collapsed ? "end" : "start"} sideOffset={8} className={`w-52 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-150 ease-out motion-reduce:animate-none ${collapsed ? "origin-left data-[state=open]:slide-in-from-left-2" : "origin-bottom data-[state=open]:slide-in-from-bottom-2"}`}>
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
          <Button variant="ghost" className={`h-10 w-full ${collapsed ? 'justify-center px-0' : 'justify-start px-3'}`} onClick={account.onLogin} aria-label="Sign in">{collapsed ? <LogIn className="h-4 w-4" /> : 'Sign in'}</Button>
        ))}
      </div>
      <UsageModal open={usageModalOpen} onOpenChange={setUsageModalOpen} />
    </aside>
  )
}
