import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PromptInput } from '@/components/chat/prompt-input'
import { TooltipProvider } from '@/components/ui/tooltip'
import { appendVoiceLevel, createSilentVoiceLevels, VOICE_LEVEL_SAMPLE_INTERVAL_MS } from '@/lib/voice-levels'
import '@/index.css'

function Harness() {
  const [levels, setLevels] = useState(createSilentVoiceLevels)
  useEffect(() => {
    let tick = 0
    const timer = setInterval(() => {
      tick += 1
      const level = tick <= 5 ? 0.05 : 0.15 + 0.7 * Math.abs(Math.sin(tick * 0.6))
      setLevels(previous => appendVoiceLevel(previous, level))
    }, VOICE_LEVEL_SAMPLE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])
  return <TooltipProvider><main className="flex min-h-screen items-end bg-background p-3 text-foreground"><PromptInput value="" onChange={() => {}} onSubmit={() => {}} onVoiceStop={() => {}} voiceRecording voiceLevels={levels} variant={new URLSearchParams(location.search).has('messenger') ? 'messenger' : 'assistant'} /></main></TooltipProvider>
}
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
