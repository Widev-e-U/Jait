import { Mic, MicOff, PhoneOff } from 'lucide-react'

import { AgentAudioVisualizerWave } from '@/components/agent-audio-visualizer-wave'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
  isElectron: boolean
}

const noDragStyle = (isElectron: boolean) =>
  isElectron ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined

/** Compact mic toggle shown in the mobile header (left cluster). */
export function VoiceMicButtonMobile({
  voiceOverlayOpen,
  setVoiceOverlayOpen,
  wakeWord,
  wakeWordEnabled,
  toggleWakeWord,
  voiceAssistant,
}: VoiceHeaderControlsBaseProps) {
  if (!wakeWord.isSupported) return null
  return (
    <button
      className={`md:hidden flex items-center justify-center h-8 w-8 rounded-lg shrink-0 transition-colors ${
        voiceOverlayOpen
          ? 'text-green-400 bg-green-500/10'
          : wakeWordEnabled
            ? wakeWord.isListening
              ? 'text-green-400 bg-green-500/10'
              : 'text-blue-400 bg-blue-500/10'
            : 'text-muted-foreground hover:bg-accent'
      }`}
      onClick={voiceOverlayOpen ? () => { voiceAssistant.disconnect(); setVoiceOverlayOpen(false) } : toggleWakeWord}
      aria-label={voiceOverlayOpen ? 'Disconnect voice' : wakeWordEnabled ? 'Disable wake word' : 'Enable wake word'}
    >
      {voiceOverlayOpen ? (
        <Mic className="h-4 w-4 animate-pulse" />
      ) : wakeWordEnabled ? (
        <Mic className={`h-4 w-4 ${wakeWord.isListening ? 'animate-pulse' : ''}`} />
      ) : (
        <MicOff className="h-4 w-4" />
      )}
    </button>
  )
}

/** Active-call controls (mute / wave visualizer / hang up) shown centered when voice is live. */
export function VoiceActiveControls({
  setVoiceOverlayOpen,
  voiceAssistant,
  isMobile,
  isElectron,
  activeProjectTitle,
}: Pick<VoiceHeaderControlsBaseProps, 'setVoiceOverlayOpen' | 'voiceAssistant' | 'isElectron'> & { isMobile: boolean; activeProjectTitle?: string | null }) {
  return (
    <div
      className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 backdrop-blur-sm px-1.5 py-1 ${isMobile ? 'pointer-events-auto' : ''}`}
      style={noDragStyle(isElectron)}
    >
      {activeProjectTitle ? (
        <span className="hidden sm:inline max-w-[10rem] truncate px-1.5 text-[11px] text-muted-foreground" title={activeProjectTitle}>
          {activeProjectTitle}
        </span>
      ) : null}
      {/* Mute toggle */}
      <button
        onClick={voiceAssistant.toggleMic}
        className={`flex items-center justify-center h-7 w-7 rounded-full transition-colors ${
          voiceAssistant.micActive
            ? 'bg-muted hover:bg-muted/80 text-foreground'
            : 'bg-destructive/15 text-destructive hover:bg-destructive/25'
        }`}
        aria-label={voiceAssistant.micActive ? 'Mute' : 'Unmute'}
      >
        {voiceAssistant.micActive ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
      </button>

      {/* Wave visualizer */}
      <AgentAudioVisualizerWave
        state={voiceAssistant.assistantSpeaking ? 'speaking' : voiceAssistant.status}
        size="sm"
        lineWidth={2}
        className="!aspect-auto !h-7 w-24 sm:w-36"
      />

      {/* Hang up */}
      <button
        onClick={() => { voiceAssistant.disconnect(); setVoiceOverlayOpen(false) }}
        className="flex items-center justify-center h-7 w-7 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
        aria-label="End call"
      >
        <PhoneOff className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/** Labelled wake-word pill shown in the desktop header (right cluster). */
export function VoiceWakeWordPill({
  voiceOverlayOpen,
  setVoiceOverlayOpen,
  wakeWord,
  wakeWordEnabled,
  toggleWakeWord,
  voiceAssistant,
}: VoiceHeaderControlsBaseProps) {
  if (!wakeWord.isSupported) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={voiceOverlayOpen ? () => { voiceAssistant.disconnect(); setVoiceOverlayOpen(false) } : toggleWakeWord}
          className={`ui-pill shrink-0 cursor-pointer transition-colors ${
            voiceOverlayOpen
              ? 'text-green-400 animate-pulse'
              : wakeWordEnabled
                ? wakeWord.isListening
                  ? 'text-green-400'
                  : 'text-blue-400'
                : 'text-muted-foreground opacity-50'
          }`}
        >
          {voiceOverlayOpen ? (
            <Mic className="h-3 w-3 animate-pulse" />
          ) : wakeWordEnabled ? (
            <Mic className={`h-3 w-3 ${wakeWord.isListening ? 'animate-pulse' : ''}`} />
          ) : (
            <MicOff className="h-3 w-3" />
          )}
          <span className="hidden sm:inline text-xs">
            {voiceOverlayOpen ? 'Voice active' : wakeWord.isListening ? 'Listening...' : wakeWordEnabled ? 'Hey Jait' : 'Wake word'}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {voiceOverlayOpen
          ? 'Voice assistant active — click to disconnect'
          : wakeWordEnabled
            ? wakeWord.isListening
              ? 'Listening for your command...'
              : 'Say "Hey Jait" to start voice assistant — click to disable'
            : 'Click to enable always-on "Hey Jait" wake word'}
      </TooltipContent>
    </Tooltip>
  )
}
