import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { ErrorBoundary } from '@/components/error-boundary'
import App from './App'
import './index.css'

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

  return <Toaster position="top-right" theme={theme} closeButton={false} offset={isElectronWin32 ? 44 : undefined} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfirmDialogProvider>
        <App />
        <ThemeAwareToaster />
      </ConfirmDialogProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
