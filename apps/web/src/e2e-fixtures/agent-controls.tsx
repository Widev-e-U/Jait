import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AppHeader } from '@/components/app-shell/app-header'
import { AppNavigationSidebar } from '@/components/app-shell/app-navigation-sidebar'
import { AgentControlButton } from '@/components/app-shell/agent-control-button'
import { MobileNavDrawer } from '@/components/mobile/mobile-nav-drawer'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAgentControl } from '@/hooks/useAgentControl'
import type { SidebarAccount } from '@/components/app-shell/mode-sidebar'
import '@/index.css'

const noop = () => {}
function Harness() {
  const control = useAgentControl({ token: 'fixture' })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [agentsPage, setAgentsPage] = useState(false)
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false)
  const [viewMode, setViewMode] = useState<'manager' | 'developer'>('manager')
  const mobile = window.innerWidth < 768
  const renderControl = (collapsed: boolean, placement: 'sidebar' | 'header' = 'sidebar') => <AgentControlButton state={control.state}
    placement={placement} avatars={control.avatars} runningCount={3} pending={control.pending} error={control.error}
    collapsed={collapsed} onOpenAgents={() => { setAgentsPage(true); setDrawerOpen(false) }} onStopAll={() => { void control.stopAll() }} onResume={() => { void control.resume() }} />
  const account: SidebarAccount = { username: 'Jakob', initial: 'J', loading: false,
    onLogin: noop, onLogout: noop, themeMode: 'system', onThemeModeChange: noop, agentControl: renderControl }
  return <TooltipProvider><div className="flex h-dvh flex-col bg-background text-foreground">
    {mobile && <AppHeader agentControl={renderControl(true, 'header')} activeManagerThreads={[]} appPlatform="web" automation={{}}
      closeScreenSharePanel={noop} currentView="agents" desktopPlatform={null} desktopRuntime={null}
      handleApplyUpdate={async () => {}} handleLogout={noop} handleThemeModeChange={noop} isAuthLoading={false}
      isAuthenticated isDesktop={false} isMaximized={false} isMobile onOpenMobileNav={() => setDrawerOpen(true)}
      openScreenSharePanel={noop} remainingPrompts={null} screenShare={{ isActive: false }} setCurrentView={noop}
      setShowLoginDialog={noop} setShowProject={noop} setShowProjectEditor={noop} setViewMode={setViewMode}
      setVoiceOverlayOpen={noop} showScreenShare={false} themeMode="system" updateApplying={false}
      updateAwaitingRestart={false} updateInfo={{ hasUpdate: true, latestVersion: '1.2.3', currentVersion: '1.2.2' }} releases={[]} user={{ username: 'Jakob' }} userInitial="J"
      viewMode={viewMode} voiceAssistant={{}} voiceControlProps={{ wakeWord: { isSupported: true, isListening: false }, wakeWordEnabled, toggleWakeWord: () => setWakeWordEnabled(enabled => !enabled), startVoiceSession: noop, canStartVoice: true }}
      voiceOverlayOpen={false} activeProjectTitle={null} />}
    <main className={`flex min-h-0 flex-1 ${mobile ? 'pt-14' : ''}`}>
      {!mobile && <AppNavigationSidebar account={account} currentView="agents" viewMode="manager"
        onNavigate={noop} onViewModeChange={noop} onOpenSettings={noop} />}
      <div className="flex-1 p-6"><h1 className="text-lg font-semibold">{agentsPage ? 'Agents page' : 'Agent controls'}</h1><p className="text-sm text-muted-foreground">Work stays visible while agents run.</p></div>
    </main>
    {mobile && <MobileNavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}
      currentView="agents" onNavigate={noop} sessionSelector={null} />}
  </div></TooltipProvider>
}
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
