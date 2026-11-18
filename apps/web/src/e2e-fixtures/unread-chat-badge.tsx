import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AppNavigationSidebar } from '@/components/app-shell/app-navigation-sidebar'
import { MobileNavDrawer } from '@/components/mobile/mobile-nav-drawer'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/hooks/useAuth'
import { UnreadChatCountContext, useUnreadChatCount } from '@/hooks/useUnreadChatCount'
import '@/index.css'

function Harness() {
  const [token, setToken] = useState<string | null>('fixture-token')
  const { count, refresh, scheduleRefresh } = useUnreadChatCount(token)
  const mobile = new URLSearchParams(window.location.search).has('mobile')
  return <UnreadChatCountContext.Provider value={count}>
    <TooltipProvider>
      <main className="flex h-dvh">
        {mobile
          ? <MobileNavDrawer open onClose={() => {}} currentView="messenger" onNavigate={() => {}} sessionSelector={null} />
          : <AppNavigationSidebar
              account={{ username: 'User', initial: 'U', loading: false, onLogin: () => {}, onLogout: () => {}, themeMode: 'system', onThemeModeChange: () => {} }}
              currentView="messenger" onNavigate={() => {}} onOpenSettings={() => {}} />}
        <div className="fixed bottom-0 left-0 z-[90] bg-background p-2">
          <button onClick={scheduleRefresh}>Chat event</button>
          <button onClick={refresh}>Reconnect</button>
          <button onClick={() => setToken(null)}>Sign out</button>
        </div>
      </main>
    </TooltipProvider>
  </UnreadChatCountContext.Provider>
}
createRoot(document.getElementById('root')!).render(<AuthProvider><Harness /></AuthProvider>)
