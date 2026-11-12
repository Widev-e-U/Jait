import { useEffect, useState } from 'react'
import { Toaster, useSonner } from 'sonner'

/** Keeps simultaneous in-app notifications in a compact, expandable deck. */
export function NotificationToaster() {
  const { toasts } = useSonner()
  const [expanded, setExpanded] = useState(false)
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

  useEffect(() => {
    if (toasts.length < 2) setExpanded(false)
  }, [toasts.length])

  const isDesktopWin32 = !!window.jaitDesktop && navigator.userAgent.includes('Windows')
  const showToggle = toasts.length > 1
  const top = isDesktopWin32 ? 44 : 16

  return <>
    {showToggle && <div className="fixed right-4 z-[101] flex items-center gap-2" style={{ top }}>
      <span className="rounded-full border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm" aria-live="polite">
        {toasts.length} notifications
      </span>
      <button
        type="button"
        className="rounded-md border bg-background px-2 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={expanded}
        aria-controls="notification-deck"
        onClick={() => setExpanded(value => !value)}
      >
        {expanded ? 'Show fewer' : 'Show notifications'}
      </button>
    </div>}
    <div id="notification-deck"><Toaster
      position="top-right"
      theme={theme}
      closeButton
      gap={8}
      expand={expanded}
      visibleToasts={4}
      offset={{ top: top + (showToggle ? 36 : 0), right: 16 }}
      mobileOffset={{ top: top + (showToggle ? 36 : 0), right: 16, left: 16 }}
    /></div>
  </>
}
