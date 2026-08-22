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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ConfirmDialogProvider>
          <HotkeysProvider>
            <App />
            <ThemeAwareToaster />
          </HotkeysProvider>
        </ConfirmDialogProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
