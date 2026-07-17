import type { ReactNode } from 'react'
import {
  Boxes,
  Calendar,
  Mail,
  MessageSquare,
  Brain,
  Settings,
  Wifi,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { AppView } from '@/lib/app-view'

interface NavItem {
  view: AppView
  label: string
  icon: typeof MessageSquare
}

const NAV_ITEMS: readonly NavItem[] = [
  { view: 'chat', label: 'Chat', icon: MessageSquare },
  { view: 'todo', label: 'Todo', icon: Boxes },
  { view: 'email', label: 'Email', icon: Mail },
  { view: 'memory', label: 'Memory', icon: Brain },
  { view: 'jobs', label: 'Jobs', icon: Calendar },
  { view: 'network', label: 'Network', icon: Wifi },
] as const

interface MobileNavDrawerProps {
  open: boolean
  onClose: () => void

  // Navigation
  currentView: AppView
  onNavigate: (view: AppView) => void

  // Projects / sessions sidebar
  sessionSelector: ReactNode

  // Settings
  onOpenSettings: () => void
}

export function MobileNavDrawer({
  open,
  onClose,
  currentView,
  onNavigate,
  sessionSelector,
  onOpenSettings,
}: MobileNavDrawerProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px] transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={`fixed right-0 top-0 z-[61] flex h-[100dvh] w-[min(20rem,88vw)] flex-col border-l bg-background shadow-2xl transition-transform duration-300 ease-out safe-top safe-bottom ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
          <span className="text-sm font-semibold">Menu</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close menu">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable content */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* Nav items */}
          <nav className="shrink-0 border-b p-2">
            <div className="grid grid-cols-3 gap-1">
              {NAV_ITEMS.map(({ view, label, icon: Icon }) => (
                <button
                  key={view}
                  onClick={() => { onNavigate(view); onClose() }}
                  className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-2xs transition-colors ${
                    currentView === view
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                  aria-label={label}
                  aria-current={currentView === view ? 'page' : undefined}
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </button>
              ))}
              <button
                onClick={() => { onOpenSettings(); onClose() }}
                className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-2xs transition-colors ${
                  currentView === 'settings'
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
                aria-label="Settings"
                aria-current={currentView === 'settings' ? 'page' : undefined}
              >
                <Settings className="h-5 w-5" />
                <span>Settings</span>
              </button>
            </div>
          </nav>

          {/* Projects / sessions selector */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-9 shrink-0 items-center border-b px-3 text-xs font-medium text-foreground">
              <span>Projects & Chats</span>
            </div>
            <div className="min-h-0 flex-1">
              {sessionSelector}
            </div>
          </div>

        </div>
      </aside>
    </>
  )
}
