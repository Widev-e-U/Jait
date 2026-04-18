import { useCallback, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { UseVoiceAssistantReturn } from '@/hooks/useVoiceAssistant'
import { GridVisualizer } from './GridVisualizer'
import { VoiceControlBar } from './VoiceControlBar'

interface VoiceAssistantOverlayProps {
  session: UseVoiceAssistantReturn
  onClose: () => void
}

/**
 * Full-screen overlay for the voice assistant, using an Aura-style
 * WebGL visualizer with transcript panel and media controls.
 */
export function VoiceAssistantOverlay({ session, onClose }: VoiceAssistantOverlayProps) {
  const { status, assistantSpeaking, micActive, userTranscript, assistantTranscript, error, disconnect, toggleMic } = session
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  const handleDisconnect = useCallback(() => {
    disconnect()
    onClose()
  }, [disconnect, onClose])

  // Escape key to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDisconnect()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleDisconnect])

  // Auto-scroll transcript (debounced to avoid layout thrash)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(id)
  }, [userTranscript, assistantTranscript])

  const isConnecting = status === 'connecting'
  const isReconnecting = status === 'reconnecting'
  const isError = status === 'error'
  const isActive = !isConnecting && !isReconnecting && !isError

  // Status label
  const statusLabel = isConnecting ? 'Connecting…'
    : isReconnecting ? 'Reconnecting…'
    : isError ? (error || 'Connection error')
    : assistantSpeaking ? 'Jait is speaking'
    : status === 'thinking' ? 'Thinking…'
    : micActive ? 'Listening — ask me anything'
    : 'Microphone muted'

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background">
      {/* Close button */}
      <button
        onClick={handleDisconnect}
        className="absolute top-4 right-4 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        title="Close (Esc)"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Main content area */}
      <div className="flex flex-col items-center flex-1 justify-center w-full max-w-lg px-6">
        {/* Status label */}
        <div className={`mb-6 text-sm font-medium tracking-wide transition-colors ${
          isError ? 'text-destructive' : 'text-muted-foreground'
        }`}>
          {statusLabel}
        </div>

        {/* Grid visualizer */}
        <div className="relative mb-8 w-full max-w-[480px]">
          <GridVisualizer
            status={status}
            assistantSpeaking={assistantSpeaking}
            rows={15}
            cols={15}
            radius={60}
            size="xl"
          />
          {/* Pulsing ring during connecting */}
          {(isConnecting || isReconnecting) && (
            <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
          )}
        </div>

        {/* Transcript area */}
        {(assistantTranscript || userTranscript) && (
          <div className="w-full max-h-40 overflow-y-auto rounded-xl bg-card border border-border/40 p-4 mb-6 space-y-2 scrollbar-thin">
            {userTranscript && (
              <div className="flex justify-end">
                <p className="text-sm bg-primary/15 text-primary rounded-xl rounded-tr-sm px-3 py-1.5 max-w-[85%]">
                  {userTranscript}
                </p>
              </div>
            )}
            {assistantTranscript && (
              <div className="flex justify-start">
                <p className="text-sm bg-muted/80 text-foreground rounded-xl rounded-tl-sm px-3 py-1.5 max-w-[85%]">
                  {assistantTranscript}
                </p>
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>

      {/* Bottom control bar — agents-ui style */}
      <div className="w-full max-w-md px-6 pb-8">
        <VoiceControlBar
          micActive={micActive}
          isConnected={isActive}
          onToggleMic={toggleMic}
          onDisconnect={handleDisconnect}
        />
        <p className="text-center text-xs text-muted-foreground/40 mt-3">
          Press <kbd className="px-1 py-0.5 rounded bg-muted/30 text-muted-foreground/60 text-2xs font-mono">Esc</kbd> to end
        </p>
      </div>
    </div>
  )
}
