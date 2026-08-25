import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { HotkeysProvider } from '@/components/hotkeys'
import { ErrorBoundary } from '@/components/error-boundary'
import { AuthProvider } from '@/hooks/useAuth'
import { installVersionWatchdog } from '@/lib/version-watchdog'
import App from './App'
import './index.css'

// Auto-reload when a new bundle is deployed, so a long-lived tab never keeps
// running stale code (e.g. an old bundle that surfaced React #185).
installVersionWatchdog()

function ThemeAwareToaster() {
  const [theme, setTheme] = React.useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  React.useEffect(() => {
    const root = document.documentElement
    const syncTheme = () => setTheme(root.classList.contains('dark') ? 'dark' : 'light')
    syncTheme()

    const observer = new MutationObserver(syncTheme)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [])

  // On Electron/Windows, offset toasts below the titlebar overlay controls
  const isElectronWin32 = !!window.jaitDesktop && navigator.userAgent.includes('Windows')

  return <Toaster position="top-right" theme={theme} closeButton gap={8} visibleToasts={4} offset={isElectronWin32 ? 44 : undefined} />
}

// Note: this app intentionally does NOT wrap the tree in <React.StrictMode>.
// StrictMode double-invokes effects on every mount (mount -> cleanup -> mount),
// and the cleanup calls ws.close() on still-CONNECTING WebSockets (the chat
// automation socket, secret-input, user-question, node-permissions, consent,
// etc.). That churns the connection once per mount and logs a noisy
// "WebSocket is closed before the connection is established" warning for every
// socket right as the app transitions login -> main view. All these effects
// already implement correct cleanup and stable deps, so the double-invoke
// provides no additional safety here. Re-enable StrictMode (wrap this render
// tree) if you want dev-only strict warnings back; production is unaffected.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <AuthProvider>
      <ConfirmDialogProvider>
        <HotkeysProvider>
          <App />
          <ThemeAwareToaster />
        </HotkeysProvider>
      </ConfirmDialogProvider>
    </AuthProvider>
  </ErrorBoundary>,
)
