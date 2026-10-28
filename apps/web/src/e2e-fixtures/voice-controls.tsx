import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { VoiceActiveControls, VoiceMicButtonMobile, VoiceWakeWordPill } from '@/components/voice/voice-header-controls'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

function Harness() {
  const [open, setOpen] = useState(false)
  const [wakeEnabled, setWakeEnabled] = useState(false)
  const [micActive, setMicActive] = useState(true)
  const [phase, setPhase] = useState<'listening' | 'thinking' | 'speaking'>('listening')
  const voice = {
    status: phase, micActive, micReady: true, assistantSpeaking: phase === 'speaking',
    userTranscript: '', assistantTranscript: '', error: undefined,
    connect: async () => {}, disconnect: () => setOpen(false),
    toggleMic: () => setMicActive(value => !value), announce: () => {},
  }
  const controls = {
    voiceOverlayOpen: open, setVoiceOverlayOpen: setOpen,
    wakeWord: { isSupported: true, isRunning: wakeEnabled, isListening: false, isChecking: false, interimTranscript: '', error: null },
    wakeWordEnabled: wakeEnabled, toggleWakeWord: () => setWakeEnabled(value => !value),
    voiceAssistant: voice, startVoiceSession: () => { setMicActive(true); setOpen(true) }, canStartVoice: true, isDesktop: false,
  }
  return <TooltipProvider><div className="min-h-screen bg-background text-foreground">
    <header className="relative flex h-14 items-center justify-between border-b px-3">
      <div className="flex items-center"><span className="pr-2 font-semibold">J</span><VoiceMicButtonMobile {...controls} /></div>
      {open && <VoiceActiveControls {...controls} isMobile={window.innerWidth < 768} />}
      <div className="hidden md:block"><VoiceWakeWordPill {...controls} /></div>
    </header>
    <main className="space-x-2 p-6"><button onClick={() => setPhase('thinking')}>Simulate thinking</button><button onClick={() => setPhase('speaking')}>Simulate speaking</button></main>
  </div></TooltipProvider>
}
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
