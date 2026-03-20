import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
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

  return <Toaster position="top-right" theme={theme} closeButton={false} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfirmDialogProvider>
      <App />
      <ThemeAwareToaster />
    </ConfirmDialogProvider>
  </React.StrictMode>,
)
