import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Toaster, useSonner } from 'sonner'
import { NotificationCornerControls } from '@/components/ui/notification-center'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useNotifications } from '@/lib/notification-center'

/**
 * In-app notification toasts. On desktop the top-right corner keeps
 * "Show all notifications" / "Mark all as read" buttons while there are
 * notifications; on mobile the header bell takes their place.
 */
export function NotificationToaster() {
  const isMobile = useIsMobile()
  const hasNotifications = useNotifications().length > 0
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  useEffect(() => {
    const root = document.documentElement
    const syncTheme = () => setTheme(root.classList.contains('dark') ? 'dark' : 'light')
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const { toasts } = useSonner()
  const [expanded, setExpanded] = useState(false)

  const isDesktopWin32 = !!window.jaitDesktop && navigator.userAgent.includes('Windows')
  const showControls = !isMobile && hasNotifications
  const top = isDesktopWin32 ? 44 : 16
  // Toasts stack as a deck; the toggle only matters once there is more than one.
  const showDeckToggle = toasts.length > 1
  const deckTop = top + (showControls ? 36 : 0)
  const toggleHeight = showDeckToggle ? 36 : 0

  useEffect(() => {
    if (toasts.length < 2) setExpanded(false)
  }, [toasts.length])

  return <>
    {showControls && <NotificationCornerControls top={top} />}
    {showDeckToggle && (
      <button
        type="button"
        aria-label={expanded ? 'Show fewer' : 'Show notifications'}
        aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}
        className="fixed right-4 z-[101] inline-flex h-7 items-center gap-1.5 rounded-md border bg-background/90 px-2 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ top: deckTop }}
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
        <span>{expanded ? 'Show fewer' : `${toasts.length} notifications`}</span>
      </button>
    )}
    <Toaster
      position="top-right"
      theme={theme}
      closeButton
      gap={8}
      visibleToasts={4}
      expand={expanded}
      offset={{ top: deckTop + toggleHeight, right: 16 }}
      mobileOffset={{ top: top + toggleHeight, right: 16, left: 16 }}
    />
  </>
}
