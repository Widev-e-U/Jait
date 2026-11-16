import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PromptInput } from '@/components/chat/prompt-input'
import { ProviderUsageBadge } from '@/components/chat/provider-usage-badge'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/hooks/useAuth'
import { setAuthToken } from '@/lib/auth-token'
import type { SessionReasoningEffort } from '@/lib/session-chat-selection'
import '@/index.css'

setAuthToken('footer-fixture-token')

function Harness() {
  const [value, setValue] = useState('')
  const [model, setModel] = useState<string | null>('first')
  const [effort, setEffort] = useState<SessionReasoningEffort | null>(null)
  return <TooltipProvider><div data-testid="panel" style={{ width: 900 }}>
    <div data-testid="composer"><PromptInput value={value} onChange={setValue} onSubmit={() => {}} placeholder="Message Jait"
      provider="codex-1" onProviderChange={() => {}} cliModel={model} onCliModelChange={setModel}
      reasoningEffort={effort} onReasoningEffortChange={setEffort} allowPersonalChatNode={false} /></div>
    <div data-testid="panel-footer"><ProviderUsageBadge provider="codex-1" model={model} /></div>
  </div></TooltipProvider>
}
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<AuthProvider><Harness /></AuthProvider>)
