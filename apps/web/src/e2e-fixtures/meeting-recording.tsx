import { MeetingRecordingSurface, MeetingRecordingWindow } from '@/components/meetings/MeetingRecordingWindow'
import { createRoot } from 'react-dom/client'
import { AppHeader } from '@/components/app-shell/app-header'
import { AppNavigationSidebar } from '@/components/app-shell/app-navigation-sidebar'
import { MeetingRecordingSettings } from '@/components/meetings/MeetingRecordingSettings'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/hooks/useAuth'
import { MeetingRecordingContext, useMeetingRecording } from '@/hooks/useMeetingRecording'
import '@/index.css'

const noop = () => {}
function Harness() {
  const mobile = window.innerWidth < 768
  const meeting = useMeetingRecording('meeting-fixture', mobile ? 'capacitor' : 'desktop')
  return <MeetingRecordingContext.Provider value={meeting}><TooltipProvider>
      <MeetingRecordingSurface />
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {mobile && <AppHeader activeManagerThreads={[]} appPlatform="capacitor" automation={{}}
        closeScreenSharePanel={noop} currentView="settings" desktopPlatform={null} desktopRuntime={null}
        handleApplyUpdate={noop} handleLogout={noop} handleThemeModeChange={noop} isAuthLoading={false}
        isAuthenticated isDesktop={false} isMaximized={false} isMobile onOpenMobileNav={noop}
        openScreenSharePanel={noop} remainingPrompts={null} screenShare={{ isActive: false }} setCurrentView={noop}
        setShowLoginDialog={noop} setShowProject={noop} setShowProjectEditor={noop} setVoiceOverlayOpen={noop}
        showScreenShare={false} themeMode="light" updateApplying={false} updateAwaitingRestart={false}
        updateInfo={null} releases={[]} user={{ username: 'Jakob' }} userInitial="J"
        voiceAssistant={{}} voiceControlProps={{ wakeWord: { isSupported: false }, canStartVoice: true, startVoiceSession: noop }}
        voiceOverlayOpen={false} activeProjectTitle={null} />}
      <main className={`flex min-h-0 flex-1 ${mobile ? 'pt-14' : ''}`}>
        {!mobile && <AppNavigationSidebar account={{ username: 'Jakob', initial: 'J', loading: false, onLogin: noop, onLogout: noop, themeMode: 'light', onThemeModeChange: noop }} currentView="settings" onNavigate={noop} onOpenSettings={noop} />}
        <div className="flex-1 overflow-auto bg-muted/20 p-4 sm:p-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <h1 className="text-xl font-semibold">Settings</h1>
            <MeetingRecordingSettings />
          </div>
        </div>
      </main>
    </div>
  </TooltipProvider></MeetingRecordingContext.Provider>
}

const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(window.jaitMeetingWindow ? <MeetingRecordingWindow {...window.jaitMeetingWindow} /> : <AuthProvider><Harness /></AuthProvider>)
