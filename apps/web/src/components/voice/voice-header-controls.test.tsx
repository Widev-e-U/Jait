import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { VoiceMicButtonMobile } from './voice-header-controls'

type MobileMicProps = Parameters<typeof VoiceMicButtonMobile>[0]

const baseProps = {
  voiceOverlayOpen: false,
  setVoiceOverlayOpen: () => {},
  wakeWord: { isSupported: true, isListening: false, isChecking: false, isRunning: true, error: null },
  wakeWordEnabled: false,
  toggleWakeWord: () => {},
  voiceAssistant: {},
  startVoiceSession: () => {},
  canStartVoice: true,
  isDesktop: false,
} as unknown as MobileMicProps

function render(overrides: Partial<MobileMicProps>) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <VoiceMicButtonMobile {...baseProps} {...overrides} />
    </TooltipProvider>,
  )
}

describe('VoiceMicButtonMobile layout', () => {
  it('holds a compact placeholder while the layout is pending', () => {
    const markup = render({ layoutPending: true })

    expect(markup).toContain('data-voice-pending')
    expect(markup).not.toContain('aria-label="Start voice conversation"')
    expect(markup).not.toContain('aria-label="Enable wake word"')
    expect(markup).not.toContain('aria-label="Voice controls"')
  })

  it('shows the inline mic and wake-word toggle without the agent layout', () => {
    const markup = render({ compactWithAgents: false, layoutPending: false })

    expect(markup).not.toContain('data-voice-pending')
    expect(markup).toContain('aria-label="Start voice conversation"')
    expect(markup).toContain('aria-label="Enable wake word"')
  })

  it('folds the voice controls into one menu beside the agent control', () => {
    const markup = render({ compactWithAgents: true, layoutPending: false })

    expect(markup).not.toContain('data-voice-pending')
    expect(markup).toContain('aria-label="Voice controls"')
  })
})
