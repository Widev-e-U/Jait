import { useEffect, useRef } from 'react'
import { type AppView, appViewToPath, parseAppView } from '@/lib/app-view'

/**
 * Keeps the active {@link AppView} in sync with the browser URL:
 * pushes history on view changes, handles back/forward, and resolves the
 * one-shot `jait://` deep-link param on mount.
 */
export function useViewRouting(currentView: AppView, setCurrentView: (view: AppView) => void) {
  // Push to history when view changes (skip on mount to avoid duplicate entry)
  const isInitialViewRef = useRef(true)
  useEffect(() => {
    const target = appViewToPath(currentView)
    if (isInitialViewRef.current) {
      // On mount, replace the URL to match the resolved view (e.g. '/' → '/chat')
      if (window.location.pathname !== target) {
        window.history.replaceState(null, '', target + window.location.search)
      }
      isInitialViewRef.current = false
      return
    }
    if (window.location.pathname !== target) {
      window.history.pushState(null, '', target)
    }
  }, [currentView])

  // Handle browser back/forward
  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname.replace(/^\/+/, '').split('/')[0]
      setCurrentView(parseAppView(path) ?? 'chat')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [setCurrentView])

  // Deep link: jait:// protocol handler.
  // When a jait:// URL is opened, the browser navigates to /?jait=<full-url>.
  // Parse it once on mount to jump to the requested view.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('jait')
    if (!raw) return
    try {
      const url = new URL(raw)
      const rawView = url.hostname || url.pathname.replace(/^\/+/, '')
      const view = parseAppView(rawView)
      if (view) setCurrentView(view)
    } catch {
      // malformed URL — ignore
    }
    // Remove the ?jait param from the address bar without reloading
    const clean = new URL(window.location.href)
    clean.searchParams.delete('jait')
    window.history.replaceState(null, '', clean.toString())
  }, [setCurrentView])
}
