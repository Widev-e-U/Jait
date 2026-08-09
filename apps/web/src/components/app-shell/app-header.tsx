import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpCircle,
  Brain,
  Calendar,
  CalendarDays,
  Cast,
  GitPullRequest,
  Menu,
  ListChecks,
  LogOut,
  Mail,
  MessageSquare,
  Monitor,
  Moon,
  Settings,
  Sun,
  Wifi,
  Loader2 as SpinnerIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { ManagerActiveThreadsMenu } from '@/components/manager/manager-thread-ui'
import { CliModelSelector } from '@/components/chat/cli-model-selector'
import { ViewModeSelector } from '@/components/chat/view-mode-selector'
import { ProgressiveNav, type ProgressiveNavItem } from '@/components/app-shell/progressive-nav'
import { JaitIcon } from '@/components/icons/model-icons'
import { LinuxWindowControls } from '@/components/desktop/linux-window-controls'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PatchNotesTooltip } from '@/components/settings/PatchNotesTooltip'
import { VoiceMicButtonMobile, VoiceActiveControls, VoiceWakeWordPill } from '@/components/voice/voice-header-controls'
import type { ThemeMode } from '@/hooks/useAuth'
import type { ProviderId } from '@/lib/agents-api'

interface AppHeaderProps {
  activeManagerThreads: any
  appPlatform: any
  automation: any
  chatProvider: ProviderId
  cliModel: string | null
  closeScreenSharePanel: any
  currentView: any
  desktopPlatform: any
  handleApplyUpdate: any
  handleLogout: any
  handleThemeModeChange: any
  isAuthenticated: any
  isElectron: any
  isMaximized: any
  isMobile: any
  onCliModelChange: (model: string | null) => void
  onOpenMobileNav: any
  openScreenSharePanel: any
  remainingPrompts: any
  screenShare: any
  setCurrentView: any
  setSendTarget: any
  setShowLoginDialog: any
  setShowProject: any
  setShowProjectEditor: any
  setViewMode: any
  setVoiceOverlayOpen: any
  showScreenShare: any
  themeMode: any
  updateApplying: any
  updateAwaitingRestart: any
  updateInfo: any
  releases: any
  user: any
  userInitial: any
  viewMode: any
  voiceAssistant: any
  voiceControlProps: any
  voiceOverlayOpen: any
  activeProjectTitle: any
}

export function AppHeader(props: AppHeaderProps) {
  const {
    activeManagerThreads,
    appPlatform,
    automation,
    chatProvider,
    cliModel,
    closeScreenSharePanel,
    currentView,
    desktopPlatform,
    handleApplyUpdate,
    handleLogout,
    handleThemeModeChange,
    isAuthenticated,
    isElectron,
    isMaximized,
    isMobile,
    onCliModelChange,
    onOpenMobileNav,
    openScreenSharePanel,
    remainingPrompts,
    screenShare,
    setCurrentView,
    setSendTarget,
    setShowLoginDialog,
    setShowProject,
    setShowProjectEditor,
    setViewMode,
    setVoiceOverlayOpen,
    showScreenShare,
    themeMode,
    updateApplying,
    updateAwaitingRestart,
    updateInfo,
    releases,
    user,
    userInitial,
    viewMode,
    voiceAssistant,
    voiceControlProps,
    voiceOverlayOpen,
    activeProjectTitle,
  } = props

  // ── Dynamic nav: measure how much horizontal room is available for the
  // inline nav buttons so items can overflow into the ⋯ menu progressively. ──
  const navRef = useRef<HTMLElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const selectorRef = useRef<HTMLDivElement>(null)
  const [navAvailableWidth, setNavAvailableWidth] = useState(0)

  const hasCentered = currentView === 'chat' && !voiceOverlayOpen

  useEffect(() => {
    const update = () => {
      const nav = navRef.current
      const right = rightRef.current
      if (!nav || !right) return
      const navLeft = nav.getBoundingClientRect().left
      let boundary = right.getBoundingClientRect().left
      // Keep the nav from sliding underneath the centered view-mode selector.
      if (hasCentered && selectorRef.current) {
        const sel = selectorRef.current.getBoundingClientRect()
        boundary = Math.min(boundary, sel.left - 16)
      }
      setNavAvailableWidth(Math.max(0, boundary - navLeft))
    }
    update()
    const ro = new ResizeObserver(update)
    if (navRef.current) ro.observe(navRef.current)
    if (rightRef.current) ro.observe(rightRef.current)
    if (selectorRef.current) ro.observe(selectorRef.current)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [hasCentered])

  // Nav items in display order (leftmost first). Items overflow right-to-left.
  const navItems: ProgressiveNavItem[] = [
    { id: 'chat', label: 'Chat', icon: MessageSquare, active: currentView === 'chat', onSelect: () => setCurrentView('chat') },
    { id: 'pulls', label: 'Pull Requests', shortLabel: 'PRs', icon: GitPullRequest, active: currentView === 'pulls', onSelect: () => setCurrentView('pulls') },
    { id: 'todo', label: 'Todo', icon: ListChecks, active: currentView === 'todo', onSelect: () => setCurrentView('todo') },
    { id: 'email', label: 'Email', icon: Mail, active: currentView === 'email', onSelect: () => setCurrentView('email') },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays, active: currentView === 'calendar', onSelect: () => setCurrentView('calendar') },
    { id: 'memory', label: 'Memory', icon: Brain, active: currentView === 'memory', onSelect: () => setCurrentView('memory') },
    { id: 'jobs', label: 'Jobs', icon: Calendar, active: currentView === 'jobs', onSelect: () => setCurrentView('jobs') },
    { id: 'network', label: 'Network', icon: Wifi, active: currentView === 'network', onSelect: () => setCurrentView('network') },
    ...(viewMode === 'developer' && !isMobile
      ? [{
          id: 'screenShare',
          label: 'Screen Share',
          icon: Cast,
          active: showScreenShare,
          onSelect: () => (showScreenShare ? closeScreenSharePanel() : openScreenSharePanel()),
        }]
      : []),
  ]

  return (
            <header
              className={
                isMobile
                  ? 'fixed top-2 left-2 right-2 z-40 flex items-center gap-1 pointer-events-none h-10'
                  : `relative flex items-center gap-1 shrink-0 border-b bg-background px-2 sm:gap-2 sm:px-5 ${isElectron ? 'h-10 !pl-[0.8rem]' : 'h-14'}`
              }
              style={isElectron ? {
                WebkitAppRegion: 'drag',
                paddingLeft: desktopPlatform === 'darwin' ? 70 : undefined,
                paddingRight: desktopPlatform === 'win32' ? 140 : undefined,
              } as React.CSSProperties : undefined}
            >
          {/* Left: Logo + mobile mic */}
          <div className={`flex items-center gap-1 shrink-0 ${isMobile ? 'pointer-events-auto rounded-2xl bg-background/70 backdrop-blur-lg shadow-lg border px-2 h-10' : ''}`} style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            <JaitIcon size={20} className="shrink-0" />
            <VoiceMicButtonMobile {...voiceControlProps} />
            {isMobile && currentView === 'chat' && activeManagerThreads.length > 0 && (
              <ManagerActiveThreadsMenu
                threads={activeManagerThreads}
                getRepositoryForThread={automation.getRepositoryForThread}
                threadPrStates={automation.threadPrStates}
                ghAvailable={automation.ghAvailable}
                onOpenThread={(threadId) => {
                  setCurrentView('chat')
                  setViewMode('manager')
                  automation.setSelectedThreadId(threadId)
                  setSendTarget('thread')
                  setShowProject(false)
                  setShowProjectEditor(false)
                }}
                onStopThread={(threadId) => automation.handleStop(threadId)}
              />
            )}
          </div>

          {/* Full nav only appears when it cannot collide with the centered mode selector. */}
          {!isMobile && (
            <ProgressiveNav
              items={navItems}
              availableWidth={navAvailableWidth}
              navRef={navRef}
              className="flex-1"
              style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}
            />
          )}

          {/* Center: ViewModeSelector OR voice controls when voice active */}
          {voiceOverlayOpen ? (
            <VoiceActiveControls
              setVoiceOverlayOpen={setVoiceOverlayOpen}
              voiceAssistant={voiceAssistant}
              isMobile={isMobile}
              isElectron={isElectron}
              activeProjectTitle={activeProjectTitle}
            />
          ) : currentView === 'chat' ? (
            <div ref={selectorRef} className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 ${isMobile ? 'pointer-events-auto rounded-2xl bg-background/70 backdrop-blur-lg shadow-lg border px-1.5 h-10 flex items-center' : ''}`} style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
              <ViewModeSelector mode={viewMode} onChange={setViewMode} compact={isMobile} />
            </div>
          ) : null}

          {/* Spacer */}
          <div className={`${isMobile ? 'flex-1' : 'hidden'} min-w-0`} />

          {/* Right: Context + Model + Account */}
          <div ref={rightRef} className={`flex items-center gap-1 sm:gap-1.5 shrink-0 ${isMobile ? 'pointer-events-auto rounded-2xl bg-background/70 backdrop-blur-lg shadow-lg border px-1 py-0.5 h-10' : ''}`} style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            {currentView === 'chat' && viewMode === 'manager' && (
              <CliModelSelector
                provider={chatProvider}
                model={cliModel}
                onChange={onCliModelChange}
                compact={isMobile}
                className="shrink-0"
              />
            )}

            {/* Desktop status items — hidden on mobile */}
            <div className="hidden md:flex items-center gap-1 sm:gap-1.5">
            {screenShare.isActive && (
              <span className="ui-pill shrink-0">
                <Cast className="h-3 w-3 text-green-500 animate-pulse" />
                <span className="hidden sm:inline">Sharing</span>
              </span>
            )}
            <VoiceWakeWordPill {...voiceControlProps} />
            {currentView === 'chat' && activeManagerThreads.length > 0 && (
              <ManagerActiveThreadsMenu
                threads={activeManagerThreads}
                getRepositoryForThread={automation.getRepositoryForThread}
                threadPrStates={automation.threadPrStates}
                ghAvailable={automation.ghAvailable}
                onOpenThread={(threadId) => {
                  setCurrentView('chat')
                  setViewMode('manager')
                  automation.setSelectedThreadId(threadId)
                  setSendTarget('thread')
                  setShowProject(false)
                  setShowProjectEditor(false)
                }}
                onStopThread={(threadId) => automation.handleStop(threadId)}
              />
            )}
            {remainingPrompts !== null && remainingPrompts <= 5 && (
              <span className="text-xs text-muted-foreground mr-1 sm:mr-2 hidden sm:inline">{remainingPrompts} remaining</span>
            )}

            </div>

            {updateInfo?.hasUpdate && (
              <PatchNotesTooltip
                targetVersion={updateInfo.latestVersion}
                notes={releases}
                align="right"
              >
                <Button
                  onClick={async () => {
                      if (appPlatform === 'web') {
                        if (!updateApplying && !updateAwaitingRestart) {
                          await handleApplyUpdate()
                        }
                      } else if (appPlatform === 'electron') {
                        const desktop = (window as any).jaitDesktop
                        toast.info('Downloading update...')
                        const dl = await desktop.downloadUpdate()
                        if (dl?.ok) {
                          toast.success('Update downloaded. Restarting...')
                          await desktop.installUpdate()
                        } else {
                          toast.error('Download failed')
                        }
                      } else if (!updateApplying) {
                        await handleApplyUpdate()
                      }
                    }}
                    variant="outline"
                    size="sm"
                    disabled={
                      (appPlatform === 'web' && (updateApplying || updateAwaitingRestart))
                      || (appPlatform === 'capacitor' && (updateApplying || !updateInfo.downloadUrl))
                    }
                    className="h-8 shrink-0 border-amber-500/30 bg-amber-500/10 px-2 text-amber-700 hover:bg-amber-500/15 hover:text-amber-800 dark:text-amber-300"
                  >
                    {(appPlatform === 'web' && (updateApplying || updateAwaitingRestart))
                    || (appPlatform === 'capacitor' && updateApplying)
                      ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                      : <ArrowUpCircle className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">
                      {(appPlatform === 'web' && (updateApplying || updateAwaitingRestart))
                      || (appPlatform === 'capacitor' && updateApplying)
                        ? 'Updating...'
                        : `v${updateInfo.latestVersion}`}
                    </span>
                  </Button>
              </PatchNotesTooltip>
            )}

            {/* Mobile avatar + menu group */}
            {isMobile ? (
              <div className="flex items-center gap-0.5 shrink-0">
                {isAuthenticated ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-sm font-medium">{userInitial}</AvatarFallback>
                        </Avatar>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel className="flex flex-col items-start gap-0.5">
                        <span title={user?.username} className="max-w-[12rem] truncate text-sm font-semibold">
                          {user?.username}
                        </span>
                        {updateInfo?.currentVersion && (
                          <span className="text-xs font-normal text-muted-foreground">
                            Jait v{updateInfo.currentVersion}
                          </span>
                        )}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setCurrentView('settings')}>
                        <Settings className="h-4 w-4 mr-2" />
                        Settings
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1.5">
                        <span className="text-xs font-medium text-muted-foreground">Theme</span>
                        <div className="flex items-center h-7 w-fit rounded-full border bg-muted/50 p-0.5 mt-1.5">
                          {([['light', Sun], ['system', Monitor], ['dark', Moon]] as const).map(([mode, Icon]) => (
                            <Tooltip key={mode}>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => { void handleThemeModeChange(mode as ThemeMode) }}
                                  className={`relative flex items-center justify-center h-6 w-6 rounded-full transition-colors ${
                                    themeMode === mode
                                      ? 'bg-background text-foreground shadow-sm'
                                      : 'text-muted-foreground hover:text-foreground'
                                  }`}
                                >
                                  <Icon className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">{mode.charAt(0).toUpperCase() + mode.slice(1)}</TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={handleLogout}>
                        <LogOut className="h-4 w-4 mr-2" />
                        Logout
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs" onClick={() => setShowLoginDialog(true)}>
                    Sign in
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 p-0" onClick={onOpenMobileNav} aria-label="Open menu">
                  <Menu className="h-4 w-4" />
                </Button>
              </div>
            ) : (
            <>
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={`rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${isElectron ? 'mr-4' : ''}`}>
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs">{userInitial}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="flex flex-col items-start gap-0.5">
                    <span title={user?.username} className="max-w-[12rem] truncate text-sm font-semibold">
                      {user?.username}
                    </span>
                    {updateInfo?.currentVersion && (
                      <span className="text-xs font-normal text-muted-foreground">
                        Jait v{updateInfo.currentVersion}
                      </span>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setCurrentView('settings')}>
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Theme</span>
                    <div className="flex items-center h-7 w-fit rounded-full border bg-muted/50 p-0.5 mt-1.5">
                      {([['light', Sun], ['system', Monitor], ['dark', Moon]] as const).map(([mode, Icon]) => (
                        <Tooltip key={mode}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => { void handleThemeModeChange(mode as ThemeMode) }}
                              className={`relative flex items-center justify-center h-6 w-6 rounded-full transition-colors ${
                                themeMode === mode
                                  ? 'bg-background text-foreground shadow-sm'
                                  : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">{mode.charAt(0).toUpperCase() + mode.slice(1)}</TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs" onClick={() => setShowLoginDialog(true)}>
                Sign in
              </Button>
            )}
            </>
            )}

            {/* Linux custom window controls (Windows uses native titleBarOverlay, macOS uses traffic lights) */}
            {isElectron && desktopPlatform === 'linux' && (
              <LinuxWindowControls isMaximized={isMaximized} />
            )}
          </div>
            </header>
  )
}
