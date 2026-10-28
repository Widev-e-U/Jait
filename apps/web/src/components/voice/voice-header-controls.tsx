import { Mic, MicOff, PhoneOff, RotateCcw, Sparkles } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipHint } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { useVoiceAssistant } from '@/hooks/useVoiceAssistant'
import type { useWakeWord } from '@/hooks/useWakeWord'

type WakeWord = ReturnType<typeof useWakeWord>
type VoiceAssistant = ReturnType<typeof useVoiceAssistant>

export interface VoiceHeaderControlsBaseProps {
  voiceOverlayOpen: boolean
  setVoiceOverlayOpen: (open: boolean) => void
  wakeWord: WakeWord
  wakeWordEnabled: boolean
  toggleWakeWord: () => void
  voiceAssistant: VoiceAssistant
  startVoiceSession: (initialText?: string) => void
  canStartVoice: boolean
  isDesktop: boolean
  compactWithAgents?: boolean
}

const noDragStyle = (isDesktop: boolean) =>
  isDesktop ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined

function wakeLabel(wakeWord: WakeWord, enabled: boolean): string {
  if (!enabled) return 'Wake word off'
  if (wakeWord.error) return 'Wake word unavailable'
  if (wakeWord.isListening) return 'Listening…'
  if (wakeWord.isChecking) return 'Checking…'
  return wakeWord.isRunning ? 'Hey Jait on' : 'Starting…'
}

/** On mobile, start a call directly or opt in to the wake-word listener. */
export function VoiceMicButtonMobile({ voiceOverlayOpen, wakeWord, wakeWordEnabled, toggleWakeWord, startVoiceSession, canStartVoice, compactWithAgents = false }: VoiceHeaderControlsBaseProps) {
  if (voiceOverlayOpen) return null
  const wakeLabelText = wakeWordEnabled ? 'Disable wake word' : 'Enable wake word'
  return (
    <div className="shrink-0 md:hidden">
      {compactWithAgents && <div className="min-[410px]:hidden">
        <DropdownMenu>
          <TooltipHint content="Voice controls">
            <DropdownMenuTrigger asChild>
              <button aria-label="Voice controls" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
                <Mic className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
          </TooltipHint>
          <DropdownMenuContent align="start">
            <DropdownMenuItem disabled={!canStartVoice} onSelect={() => startVoiceSession()}>
              <Mic className="mr-2 h-4 w-4" />Start voice conversation
            </DropdownMenuItem>
            {wakeWord.isSupported && <DropdownMenuItem disabled={!canStartVoice && !wakeWordEnabled} onSelect={toggleWakeWord}>
              <Sparkles className="mr-2 h-4 w-4" />{wakeLabelText}
            </DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>}
      <div className={compactWithAgents ? 'hidden min-[410px]:flex' : 'flex'}>
        <TooltipHint content={canStartVoice ? 'Start voice conversation' : 'Sign in to use voice'}>
          <button onClick={() => startVoiceSession()} disabled={!canStartVoice} className="flex h-10 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40" aria-label="Start voice conversation">
            <Mic className="h-4 w-4" />
          </button>
        </TooltipHint>
        {wakeWord.isSupported && <TooltipHint content={wakeWord.error ?? wakeLabel(wakeWord, wakeWordEnabled)}><button onClick={toggleWakeWord} disabled={!canStartVoice && !wakeWordEnabled} aria-label={wakeLabelText} aria-pressed={wakeWordEnabled}

          className={`flex h-10 w-6 items-center justify-center rounded-lg transition-colors ${wakeWord.error ? 'text-destructive' : wakeWordEnabled ? 'text-sky-500' : 'text-muted-foreground'}`}>
          <Sparkles className={`h-4 w-4 ${wakeWord.isListening || wakeWord.isChecking ? 'motion-safe:animate-pulse' : ''}`} />
        </button></TooltipHint>}
      </div>
    </div>
  )
}

/** Rounded, stateful call controls replace the sharp waveform. */
export function VoiceActiveControls({ setVoiceOverlayOpen, voiceAssistant, startVoiceSession, isMobile, isDesktop, activeProjectTitle }:
  Pick<VoiceHeaderControlsBaseProps, 'setVoiceOverlayOpen' | 'voiceAssistant' | 'startVoiceSession' | 'isDesktop'> & { isMobile: boolean; activeProjectTitle?: string | null }) {
  const status = voiceAssistant.status === 'error' ? 'Connection error'
    : !voiceAssistant.micReady || ['connecting', 'connected', 'reconnecting'].includes(voiceAssistant.status) ? 'Connecting…'
      : !voiceAssistant.micActive ? 'Mic muted'
        : voiceAssistant.assistantSpeaking ? 'Speaking'
          : voiceAssistant.status === 'thinking' ? 'Thinking…' : 'Listening'
  const detail = voiceAssistant.error || (voiceAssistant.userTranscript ? `You: ${voiceAssistant.userTranscript}` : status)
  const close = () => { voiceAssistant.disconnect(); setVoiceOverlayOpen(false) }

  return (
    <div className={`absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-border/70 bg-background/95 px-1.5 py-1 shadow-sm backdrop-blur-md ${isMobile ? '' : 'sm:gap-2'}`}
      style={noDragStyle(isDesktop)}>
      {activeProjectTitle && <TooltipHint content={activeProjectTitle}>
        <span className="hidden max-w-[8rem] truncate pl-2 text-[11px] text-muted-foreground lg:inline">{activeProjectTitle}</span>
      </TooltipHint>}
      <button onClick={voiceAssistant.toggleMic} disabled={!voiceAssistant.micReady}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${voiceAssistant.micActive ? 'bg-muted text-foreground hover:bg-accent' : 'bg-destructive/15 text-destructive hover:bg-destructive/25'}`}
        aria-label={voiceAssistant.micActive ? 'Mute microphone' : 'Unmute microphone'} aria-pressed={!voiceAssistant.micActive}>
        {voiceAssistant.micActive ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
      </button>
      <TooltipHint content={detail}>
        <div className="flex min-w-[6.5rem] items-center gap-2 px-1 sm:min-w-[8rem]" role="status" aria-live="polite" tabIndex={0}>
          <span aria-hidden="true" className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${voiceAssistant.status === 'error' ? 'bg-destructive/15' : 'bg-sky-400/15'}`}>
            <span className={`absolute inset-0 rounded-full ${voiceAssistant.status === 'error' ? 'bg-destructive/15' : 'bg-gradient-to-br from-cyan-300/40 via-sky-400/30 to-violet-400/30'} ${voiceAssistant.assistantSpeaking || voiceAssistant.status === 'thinking' ? 'motion-safe:animate-pulse' : ''}`} />
            <span className={`h-3.5 w-3.5 rounded-full shadow-[0_0_12px_rgba(56,189,248,0.4)] ${voiceAssistant.status === 'error' ? 'bg-destructive' : 'bg-gradient-to-br from-cyan-200 via-sky-400 to-indigo-400'}`} />
          </span>
          <span className="min-w-0 leading-tight"><span className="block text-[11px] font-semibold text-foreground">Jait</span><span className="block whitespace-nowrap text-[10px] text-muted-foreground">{status}</span></span>
        </div>
      </TooltipHint>
      {voiceAssistant.status === 'error' && <button onClick={() => startVoiceSession()} aria-label="Retry voice connection" className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground hover:bg-accent"><RotateCcw className="h-3.5 w-3.5" /></button>}
      <button onClick={close} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90" aria-label="End voice conversation">
        <PhoneOff className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/** Direct call and opt-in wake listener for the desktop header. */
export function VoiceWakeWordPill({ voiceOverlayOpen, wakeWord, wakeWordEnabled, toggleWakeWord, startVoiceSession, canStartVoice }: VoiceHeaderControlsBaseProps) {
  if (voiceOverlayOpen) return null
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild><button onClick={() => startVoiceSession()} disabled={!canStartVoice} className="ui-pill cursor-pointer text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40" aria-label="Start voice conversation"><Mic className="h-3 w-3" /><span className="text-xs">Talk</span></button></TooltipTrigger>
        <TooltipContent side="bottom">{canStartVoice ? 'Start a voice conversation now' : 'Sign in to use voice'}</TooltipContent>
      </Tooltip>
      {wakeWord.isSupported && <Tooltip>
        <TooltipTrigger asChild><button onClick={toggleWakeWord} disabled={!canStartVoice && !wakeWordEnabled} aria-pressed={wakeWordEnabled} aria-label={wakeWordEnabled ? 'Disable wake word' : 'Enable wake word'}
          className={`ui-pill cursor-pointer transition-colors ${wakeWord.error && wakeWordEnabled ? 'text-destructive' : wakeWordEnabled ? 'text-sky-500' : 'text-muted-foreground'}`}>
          <Sparkles className="h-3 w-3" /><span className="text-xs">{!canStartVoice && wakeWordEnabled ? 'Sign in for wake word' : wakeLabel(wakeWord, wakeWordEnabled)}</span>
        </button></TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-72">{wakeWord.error && wakeWordEnabled ? wakeWord.error : wakeWordEnabled
          ? 'Say “Hey Jait” to start. Ambiguous phrases may be checked by your configured System One model; browser speech recognition may use its provider.'
          : 'Enable “Hey Jait” listening. Ambiguous phrases may be sent to your configured System One model.'}</TooltipContent>
      </Tooltip>}
    </div>
  )
}
