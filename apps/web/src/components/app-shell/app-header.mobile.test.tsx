import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppHeader } from './app-header'

type HeaderProps = Parameters<typeof AppHeader>[0]

const noop = () => {}
const MIC_LABEL = 'aria-label="Start voice conversation"'
const countOccurrences = (markup: string, needle: string) => markup.split(needle).length - 1

const voiceControlProps = {
  voiceOverlayOpen: false,
  setVoiceOverlayOpen: noop,
  wakeWord: { isSupported: true, isListening: false, isChecking: false, isRunning: true, error: null },
  wakeWordEnabled: false,
  toggleWakeWord: noop,
  voiceAssistant: {},
  startVoiceSession: noop,
  canStartVoice: false,
  isDesktop: false,
}

const baseProps = {
  activeManagerThreads: [],
  activeProjectTitle: null,
  agentControl: null,
  appPlatform: 'web',
  automation: {},
  closeScreenSharePanel: noop,
  currentView: 'chat',
  desktopPlatform: null,
  desktopRuntime: null,
  handleApplyUpdate: noop,
  handleLogout: noop,
  handleThemeModeChange: noop,
  isAuthLoading: false,
  isAuthenticated: false,
  isDesktop: false,
  isMaximized: false,
  isMobile: true,
  onOpenMobileNav: noop,
  openScreenSharePanel: noop,
  releases: [],
  remainingPrompts: null,
  screenShare: { isActive: false },
  setCurrentView: noop,
  setShowLoginDialog: noop,
  setShowProject: noop,
  setShowProjectEditor: noop,
  setVoiceOverlayOpen: noop,
  showScreenShare: false,
  themeMode: 'system',
  updateApplying: false,
  updateAwaitingRestart: false,
  updateInfo: null,
  user: null,
  userInitial: 'J',
  voiceAssistant: {},
  voiceControlProps,
  voiceOverlayOpen: false,
} as unknown as HeaderProps

function renderHeader(overrides: Partial<HeaderProps>) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <AppHeader {...baseProps} {...overrides} />
    </TooltipProvider>,
  )
}

describe('mobile AppHeader voice and agent slot', () => {
  it('holds the voice slot while auth loads instead of flashing inline voice buttons', () => {
    const markup = renderHeader({ isAuthLoading: true })

    expect(markup).toContain('data-voice-pending')
    // The desktop Talk pill also renders (hidden below md), so only it carries the label here.
    expect(countOccurrences(markup, MIC_LABEL)).toBe(1)
    expect(markup).not.toContain('aria-label="Voice controls"')
    // The logo keeps its agent-layout slot so the voice group doesn't shift left on load.
    expect(markup).toContain('min-[470px]:flex')
  })

  it('shows the inline voice buttons once auth settles without an agent control', () => {
    const markup = renderHeader({ isAuthLoading: false, isAuthenticated: false })

    expect(markup).not.toContain('data-voice-pending')
    // Desktop Talk pill plus the mobile inline mic.
    expect(countOccurrences(markup, MIC_LABEL)).toBe(2)
    expect(markup).not.toContain('min-[470px]:flex')
  })

  it('folds voice into the compact menu beside the agent control', () => {
    const markup = renderHeader({
      isAuthLoading: false,
      isAuthenticated: true,
      user: { username: 'test-user' },
      agentControl: <span>agent-control</span>,
    })

    expect(markup).not.toContain('data-voice-pending')
    expect(markup).toContain('aria-label="Voice controls"')
    expect(markup).toContain('min-[470px]:flex')
  })
})
