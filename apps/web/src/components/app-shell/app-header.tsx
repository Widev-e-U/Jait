import type React from 'react'
import { useState } from 'react'
import {
  BarChart3,
  Network,
  Cast,
  Menu,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
} from 'lucide-react'

import { ManagerActiveThreadsMenu } from '@/components/manager/manager-thread-ui'
import { JaitIcon } from '@/components/icons/model-icons'
import { LinuxWindowControls } from '@/components/desktop/linux-window-controls'
import { WinCaptionButtons } from '@/components/desktop/win-caption-buttons'
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
import { Tooltip, TooltipContent, TooltipTrigger , TooltipHint } from '@/components/ui/tooltip'
import { UpdateButton } from '@/components/app-shell/update-button'
import { UsageModal } from '@/components/app-shell/usage-modal'
import { CatalogueModal } from '@/components/app-shell/catalogue-modal'
import { VoiceMicButtonMobile, VoiceActiveControls, VoiceWakeWordPill } from '@/components/voice/voice-header-controls'
import type { ThemeMode } from '@/hooks/useAuth'

interface AppHeaderProps {
  agentControl?: React.ReactNode
  activeManagerThreads: any
  appPlatform: any
  automation: any
  closeScreenSharePanel: any
  currentView: any
  desktopPlatform: any
  desktopRuntime: 'tauri' | null
  handleApplyUpdate: any
  handleLogout: any
  handleThemeModeChange: any
  isAuthLoading: boolean
  isAuthenticated: any
  isDesktop: any
  isMaximized: any
  isMobile: any
  onOpenMobileNav: any
  openScreenSharePanel: any
  remainingPrompts: any
  screenShare: any
  setCurrentView: any
  setShowLoginDialog: any
  setShowProject: any
  setShowProjectEditor: any
  setVoiceOverlayOpen: any
  showScreenShare: any
  themeMode: any
  updateApplying: any
  updateAwaitingRestart: any
  updateInfo: any
  releases: any
  user: any
  userInitial: any
  voiceAssistant: any
  voiceControlProps: any
  voiceOverlayOpen: any
  activeProjectTitle: any
}

export function AppHeader(props: AppHeaderProps) {
  const {
    agentControl,
    activeManagerThreads,
    appPlatform,
    automation,
    desktopPlatform,
    desktopRuntime,
    handleApplyUpdate,
    handleLogout,
    handleThemeModeChange,
    isAuthLoading,
    isAuthenticated,
    isDesktop,
    isMaximized,
    isMobile,
    onOpenMobileNav,
    remainingPrompts,
    screenShare,
    setCurrentView,
    setShowLoginDialog,
    setShowProject,
    setShowProjectEditor,
    setVoiceOverlayOpen,
    themeMode,
    updateApplying,
    updateAwaitingRestart,
    updateInfo,
    releases,
    user,
    userInitial,
    voiceAssistant,
    voiceControlProps,
    voiceOverlayOpen,
    activeProjectTitle,
  } = props

  // Provider usage modal (avatar dropdown → "Usage")
  const [usageModalOpen, setUsageModalOpen] = useState(false)
  const [catalogueModalOpen, setCatalogueModalOpen] = useState(false)

  const sidebarOwnsNavigation = !isMobile

  // Linux uses native window-manager decorations. Besides matching KDE/GNOME
  // conventions, this avoids WebKitGTK/X11 swallowing clicks on controls that
  // are nested below a `data-tauri-drag-region` ancestor.
  const hasCustomTitleBar = desktopRuntime === 'tauri'
    && desktopPlatform !== null
    && desktopPlatform !== 'linux'

  return (
            <>
            <header data-app-header
              className={
                isMobile
                  ? 'fixed top-2 left-2 right-2 z-40 flex items-center gap-1 px-1 h-10 rounded-2xl bg-background/70 backdrop-blur-lg shadow-lg border'
                  : `relative flex items-center gap-1 shrink-0 border-b bg-background px-2 sm:gap-2 sm:px-5 ${isDesktop ? 'h-10 !pl-[0.8rem]' : 'h-10'}`
              }
              data-tauri-drag-region={hasCustomTitleBar || undefined}
              style={isDesktop ? {
                paddingLeft: desktopPlatform === 'darwin' ? 70 : undefined,
                // Reserve the right edge for the caption-button strip: the
                // native titleBarOverlay on Desktop Windows, the custom
                // WinCaptionButtons on the Tauri Windows shell (3 × 47 px
                // native-metric buttons, see below).
                paddingRight: (!isMobile && desktopPlatform === 'win32' && desktopRuntime === 'tauri') ? 140 : undefined,
              } as React.CSSProperties : undefined}
            >
          {/* Left: Logo + mobile mic */}
          <div className={`flex items-center shrink-0 ${isMobile ? 'gap-0 h-10' : 'gap-1'}`} style={isDesktop ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            <span className={isMobile
              ? `ml-2 h-10 w-5 shrink-0 items-center justify-center ${agentControl ? 'hidden min-[470px]:flex' : 'flex'}`
              : 'inline-flex shrink-0'}>
              <JaitIcon size={20} />
            </span>
            <VoiceMicButtonMobile {...voiceControlProps} compactWithAgents={isMobile && Boolean(agentControl)} />
            {isMobile && agentControl}
          </div>

          {/* Center: voice controls when voice active */}
          {voiceOverlayOpen && (
            <VoiceActiveControls
              setVoiceOverlayOpen={setVoiceOverlayOpen}
              voiceAssistant={voiceAssistant}
              startVoiceSession={voiceControlProps.startVoiceSession}
              isMobile={isMobile}
              isDesktop={isDesktop}
              activeProjectTitle={activeProjectTitle}
            />
          )}

          {/* Spacer — on mobile this keeps the right cluster pinned to the trailing edge. */}
          <div className={`${isMobile ? 'flex-1' : 'hidden'} min-w-0`} />

          {/* Right: Context + Model + Account */}
          <div className={`flex items-center gap-2 sm:gap-1.5 shrink-0 ${isMobile ? 'py-0.5 h-10' : ''}`} style={isDesktop ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>

            {/* Desktop status items — hidden on mobile */}
            <div className="hidden md:flex items-center gap-1 sm:gap-1.5">
            {screenShare.isActive && (
              <span className="ui-pill shrink-0">
                <Cast className="h-3 w-3 text-green-500 animate-pulse" />
                <span className="hidden sm:inline">Sharing</span>
              </span>
            )}
            <VoiceWakeWordPill {...voiceControlProps} />
            {activeManagerThreads.length > 0 && (
              <ManagerActiveThreadsMenu
                threads={activeManagerThreads}
                getRepositoryForThread={automation.getRepositoryForThread}
                threadPrStates={automation.threadPrStates}
                ghAvailable={automation.ghAvailable}
                onOpenThread={(threadId) => {
                  setCurrentView('threads')
                  automation.setSelectedThreadId(threadId)
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

            {!isMobile && agentControl}
            <UpdateButton appPlatform={appPlatform} updateInfo={updateInfo} releases={releases} updateApplying={updateApplying} updateAwaitingRestart={updateAwaitingRestart} onApplyUpdate={handleApplyUpdate} />

            {/* Mobile avatar + menu group */}
            {isMobile ? (
              <div className="flex items-center gap-0 shrink-0">
                {isAuthLoading ? (
                  <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" aria-label="Loading account" />
                ) : isAuthenticated ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button aria-label="Account menu" className="inline-flex h-10 w-8 !min-w-8 shrink-0 items-center justify-center rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-sm font-medium leading-none tracking-normal">
                            {userInitial}
                          </AvatarFallback>
                        </Avatar>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel className="flex flex-col items-start gap-0.5">
                        <TooltipHint content={user?.username}>
                        <span className="max-w-[12rem] truncate text-sm font-semibold">
                          {user?.username}
                        </span>
                        </TooltipHint>
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
                      <DropdownMenuItem onSelect={() => setUsageModalOpen(true)}>
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Usage
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setCatalogueModalOpen(true)}>
                        <Network className="h-4 w-4 mr-2" />
                        Catalogue
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
                <Button variant="ghost" size="icon" className="h-10 w-8 !min-w-8 shrink-0 p-0" onClick={onOpenMobileNav} aria-label="Open menu">
                  <Menu className="h-4 w-4" />
                </Button>
              </div>
            ) : (
            <>
            {!sidebarOwnsNavigation && (isAuthLoading ? (
              <div className={`h-7 w-7 shrink-0 animate-pulse rounded-full bg-muted ${isDesktop ? 'mr-4' : ''}`} aria-label="Loading account" />
            ) : isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button aria-label="Account menu" className={`inline-flex items-center justify-center rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${isDesktop ? 'mr-4' : ''}`}>
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs">{userInitial}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="flex flex-col items-start gap-0.5">
                    <TooltipHint content={user?.username}>
                    <span className="max-w-[12rem] truncate text-sm font-semibold">
                      {user?.username}
                    </span>
                    </TooltipHint>
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
                  <DropdownMenuItem onSelect={() => setUsageModalOpen(true)}>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Usage
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setCatalogueModalOpen(true)}>
                    <Network className="h-4 w-4 mr-2" />
                    Catalogue
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
            ))}
            </>
            )}

            {/* Linux uses native WM decorations. Frameless Tauri platforms
                keep custom controls: Windows gets the native-metric strip;
                other platforms use the compact control. */}
            {isDesktop && hasCustomTitleBar && (isMobile || desktopPlatform !== 'win32') && (
              <LinuxWindowControls isMaximized={isMaximized} />
            )}
            {isDesktop && !isMobile && hasCustomTitleBar && desktopPlatform === 'win32' && (
              <WinCaptionButtons isMaximized={isMaximized} />
            )}
          </div>
            </header>
            <UsageModal open={usageModalOpen} onOpenChange={setUsageModalOpen} />
            <CatalogueModal open={catalogueModalOpen} onOpenChange={setCatalogueModalOpen} />
            </>
  )
}
