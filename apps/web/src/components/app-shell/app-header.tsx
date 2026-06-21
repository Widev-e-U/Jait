import type React from 'react'
import {
  ArrowUpCircle,
  Brain,
  Calendar,
  Cast,
  EllipsisVertical,
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
import { ContextIndicator } from '@/components/chat/context-indicator'
import { ViewModeSelector } from '@/components/chat/view-mode-selector'
import { ModelIcon, formatModelDisplayLabel, getModelDisplayName, JaitIcon } from '@/components/icons/model-icons'
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
import { VoiceMicButtonMobile, VoiceActiveControls, VoiceWakeWordPill } from '@/components/voice/voice-header-controls'
import type { ThemeMode } from '@/hooks/useAuth'

interface AppHeaderProps {
  activeManagerThreads: any
  appPlatform: any
  automation: any
  chatProvider: any
  cliModel: any
  closeScreenSharePanel: any
  contextUsage: any
  currentView: any
  desktopPlatform: any
  handleApplyUpdate: any
  handleLogout: any
  handleThemeModeChange: any
  isAuthenticated: any
  isElectron: any
  isMaximized: any
  isMobile: any
  model: any
  onOpenMobileNav: any
  openScreenSharePanel: any
  provider: any
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
  user: any
  userInitial: any
  viewMode: any
  voiceAssistant: any
  voiceControlProps: any
  voiceOverlayOpen: any
}

export function AppHeader(props: AppHeaderProps) {
  const {
    activeManagerThreads,
    appPlatform,
    automation,
    chatProvider,
    cliModel,
    closeScreenSharePanel,
    contextUsage,
    currentView,
    desktopPlatform,
    handleApplyUpdate,
    handleLogout,
    handleThemeModeChange,
    isAuthenticated,
    isElectron,
    isMaximized,
    isMobile,
    model,
    onOpenMobileNav,
    openScreenSharePanel,
    provider,
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
    user,
    userInitial,
    viewMode,
    voiceAssistant,
    voiceControlProps,
    voiceOverlayOpen,
  } = props

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
                  automation.setSelectedThreadId(threadId)
                  setSendTarget('thread')
                  setShowProject(false)
                  setShowProjectEditor(false)
                }}
                onStopThread={(threadId) => automation.handleStop(threadId)}
              />
            )}
          </div>

          {/* Nav — hidden on mobile, visible on md+ */}
          <nav className="hidden md:flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-none" style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={currentView === 'chat' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 shrink-0 rounded-lg gap-1.5 px-2 text-xs"
                  onClick={() => setCurrentView('chat')}
                  aria-label="Chat"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Chat</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Chat</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={currentView === 'todo' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 shrink-0 rounded-lg gap-1.5 px-2 text-xs"
                  onClick={() => setCurrentView('todo')}
                  aria-label="Todo"
                >
                  <ListChecks className="h-3.5 w-3.5" />
                  <span>Todo</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Todo</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={currentView === 'email' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 shrink-0 rounded-lg gap-1.5 px-2 text-xs"
                  onClick={() => setCurrentView('email')}
                  aria-label="Email"
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span>Email</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Email</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={currentView === 'memory' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 shrink-0 rounded-lg gap-1.5 px-2 text-xs"
                  onClick={() => setCurrentView('memory')}
                  aria-label="Memory"
                >
                  <Brain className="h-3.5 w-3.5" />
                  <span>Memory</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Memory</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={currentView === 'jobs' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 shrink-0 rounded-lg gap-1.5 px-2 text-xs"
                  onClick={() => setCurrentView('jobs')}
                  aria-label="Jobs"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Jobs</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Jobs</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={currentView === 'network' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 shrink-0 rounded-lg gap-1.5 px-2 text-xs"
                  onClick={() => setCurrentView('network')}
                  aria-label="Network"
                >
                  <Wifi className="h-3.5 w-3.5" />
                  <span>Network</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Network</TooltipContent>
            </Tooltip>
            {viewMode === 'developer' && !isMobile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showScreenShare ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 shrink-0 rounded-lg gap-1.5 px-2 text-xs"
                    onClick={() => showScreenShare ? closeScreenSharePanel() : openScreenSharePanel()}
                    aria-label="Screen sharing"
                  >
                    <Cast className="h-3.5 w-3.5" />
                    <span>Screen Share</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Screen sharing</TooltipContent>
              </Tooltip>
            )}
          </nav>

          {/* Center: ViewModeSelector OR voice controls when voice active */}
          {voiceOverlayOpen ? (
            <VoiceActiveControls
              setVoiceOverlayOpen={setVoiceOverlayOpen}
              voiceAssistant={voiceAssistant}
              isMobile={isMobile}
              isElectron={isElectron}
            />
          ) : currentView === 'chat' ? (
            <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 ${isMobile ? 'pointer-events-auto rounded-2xl bg-background/70 backdrop-blur-lg shadow-lg border px-1.5 h-10 flex items-center' : ''}`} style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
              <ViewModeSelector mode={viewMode} onChange={setViewMode} compact={isMobile} />
            </div>
          ) : null}

          {/* Spacer */}
          <div className="flex-1 min-w-0" />

          {/* Right: Context + Model + Account */}
          <div className={`flex items-center gap-1 sm:gap-1.5 shrink-0 ${isMobile ? 'pointer-events-auto rounded-2xl bg-background/70 backdrop-blur-lg shadow-lg border px-1 py-0.5 h-10' : ''}`} style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
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
                  automation.setSelectedThreadId(threadId)
                  setSendTarget('thread')
                  setShowProject(false)
                  setShowProjectEditor(false)
                }}
                onStopThread={(threadId) => automation.handleStop(threadId)}
              />
            )}
            <ContextIndicator usage={contextUsage} />
            {(() => {
              const effectiveModel = cliModel ?? model
              const displayProvider = chatProvider === 'codex' ? 'openai'
                : chatProvider === 'claude-code' ? 'anthropic'
                : provider ?? 'ollama'
              const displayModel = chatProvider === 'codex' ? (cliModel ? formatModelDisplayLabel(cliModel) : 'Codex')
                : chatProvider === 'claude-code' ? (cliModel ? formatModelDisplayLabel(cliModel) : 'Claude Code')
                : effectiveModel ? getModelDisplayName(effectiveModel) : null
              const tooltipText = chatProvider === 'codex' ? `OpenAI Codex CLI${cliModel ? ` · ${cliModel}` : ''}`
                : chatProvider === 'claude-code' ? `Anthropic Claude Code CLI${cliModel ? ` · ${cliModel}` : ''}`
                : effectiveModel ?? ''
              return displayModel ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="ui-pill cursor-default sm:mr-2">
                      <ModelIcon provider={displayProvider} model={chatProvider === 'codex' ? 'codex' : chatProvider === 'claude-code' ? 'claude-3' : effectiveModel ?? undefined} size={16} />
                      <span className="text-xs text-muted-foreground hidden sm:inline">{displayModel}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{tooltipText}</TooltipContent>
                </Tooltip>
              ) : null
            })()}
            {remainingPrompts !== null && remainingPrompts <= 5 && (
              <span className="text-xs text-muted-foreground mr-1 sm:mr-2 hidden sm:inline">{remainingPrompts} remaining</span>
            )}

            </div>

            {updateInfo?.hasUpdate && (
              <Tooltip>
                <TooltipTrigger asChild>
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
                      } else {
                        window.open(
                          'https://github.com/Widev-e-U/Jait/releases/latest',
                          '_blank',
                        )
                      }
                    }}
                    variant="outline"
                    size="sm"
                    disabled={appPlatform === 'web' && (updateApplying || updateAwaitingRestart)}
                    className="h-8 shrink-0 border-amber-500/30 bg-amber-500/10 px-2 text-amber-700 hover:bg-amber-500/15 hover:text-amber-800 dark:text-amber-300"
                  >
                    {appPlatform === 'web' && (updateApplying || updateAwaitingRestart)
                      ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                      : <ArrowUpCircle className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">
                      {appPlatform === 'web' && (updateApplying || updateAwaitingRestart)
                        ? 'Updating...'
                        : `v${updateInfo.latestVersion}`}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {appPlatform === 'web' && (updateApplying || updateAwaitingRestart)
                    ? 'Updating and refreshing...'
                    : `Update available — v${updateInfo.latestVersion}`}
                </TooltipContent>
              </Tooltip>
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
                      <DropdownMenuLabel>{user?.username}</DropdownMenuLabel>
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
            {/* Desktop: Mobile overflow menu */}
            <div className="md:hidden shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0">
                    <EllipsisVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Navigate</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => setCurrentView('chat')}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Chat
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setCurrentView('jobs')}>
                    <Calendar className="h-4 w-4 mr-2" />
                    Jobs
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setCurrentView('todo')}>
                    <ListChecks className="h-4 w-4 mr-2" />
                    Todo
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setCurrentView('email')}>
                    <Mail className="h-4 w-4 mr-2" />
                    Email
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setCurrentView('memory')}>
                    <Brain className="h-4 w-4 mr-2" />
                    Memory
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setCurrentView('network')}>
                    <Wifi className="h-4 w-4 mr-2" />
                    Network
                  </DropdownMenuItem>
                  {viewMode === 'developer' && (
                    <DropdownMenuItem onSelect={() => showScreenShare ? closeScreenSharePanel() : openScreenSharePanel()}>
                      <Cast className="h-4 w-4 mr-2" />
                      {showScreenShare ? 'Hide Share' : 'Screen Share'}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setCurrentView('settings')}>
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs">{userInitial}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{user?.username}</DropdownMenuLabel>
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
