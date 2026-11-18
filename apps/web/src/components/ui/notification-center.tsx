import { useState } from 'react'
import { Bell, Check, CheckCheck } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { markAllNotificationsRead, markNotificationsRead, useNotifications, type NotificationEntry } from '@/lib/notification-center'
import { openNotificationEntry } from '@/lib/system-notifications'
import { cn } from '@/lib/utils'

const LEVEL_DOT: Record<NotificationEntry['level'], string> = {
  info: 'bg-sky-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-destructive',
}

function timeAgo(at: number): string {
  const minutes = Math.floor((Date.now() - at) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function unreadCountLabel(count: number): string {
  return count > 99 ? '99+' : String(count)
}

function NotificationList({ onOpen }: { onOpen: () => void }) {
  const notifications = useNotifications()

  return <div className="flex max-h-[min(28rem,70vh)] flex-col">
    <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
      <span className="text-sm font-semibold">Notifications</span>
      {notifications.length > 0 && (
        <button type="button" className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={markAllNotificationsRead}>
          <CheckCheck className="h-3.5 w-3.5" />
          Mark all as read
        </button>
      )}
    </div>
    {notifications.length === 0 ? (
      <p className="px-3 py-8 text-center text-xs text-muted-foreground">No notifications</p>
    ) : (
      <ul className="min-h-0 flex-1 overflow-y-auto py-1">
        {notifications.map(item => (
          <li key={item.id} className="group relative">
            <button
              type="button"
              className="flex w-full items-start gap-2.5 px-3 py-2 pr-9 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              onClick={() => {
                if (item.link) { openNotificationEntry(item); onOpen() } else markNotificationsRead([item.id])
              }}
            >
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', LEVEL_DOT[item.level])} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(item.createdAt)}</span>
                </span>
                {item.body && <span className="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground">{item.body}</span>}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Mark "${item.title}" as read`}
              title="Mark as read"
              className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              onClick={() => markNotificationsRead([item.id])}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
}

/** Desktop: top-right "Notifications" and "Mark all as read" buttons, kept while notifications exist. */
export function NotificationCornerControls({ top }: { top: number }) {
  const notifications = useNotifications()
  const [open, setOpen] = useState(false)
  const count = notifications.length
  if (count === 0) return null

  const buttonClass = 'inline-flex h-7 items-center gap-1.5 rounded-md border bg-background/90 px-2 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:text-foreground'

  return <div className="fixed right-4 z-[101] flex items-center gap-2" style={{ top }}>
    <button type="button" className={buttonClass} onClick={markAllNotificationsRead}>
      <CheckCheck className="h-3.5 w-3.5" />
      Mark all as read
    </button>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={buttonClass} aria-label={`Show all notifications, ${count} unread`}>
          <Bell className="h-3.5 w-3.5" />
          Show all notifications
          <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground" aria-hidden>{unreadCountLabel(count)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-[102] w-80 p-0" onOpenAutoFocus={event => event.preventDefault()}>
        <NotificationList onOpen={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  </div>
}

/** Mobile header: bell with the unread count; opens the same notification list. */
export function NotificationBell({ className }: { className?: string }) {
  const count = useNotifications().length
  const [open, setOpen] = useState(false)

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        className={cn('relative inline-flex h-10 w-8 !min-w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:text-foreground', className)}
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute right-0 top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground" aria-hidden>
            {unreadCountLabel(count)}
          </span>
        )}
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={10} collisionPadding={8} className="w-[min(20rem,calc(100vw-1rem))] p-0" onOpenAutoFocus={event => event.preventDefault()}>
      <NotificationList onOpen={() => setOpen(false)} />
    </PopoverContent>
  </Popover>
}
