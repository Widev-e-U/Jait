import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ProviderModelSelector } from '@/components/chat/provider-model-selector'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/hooks/useAuth'
import { setAuthToken } from '@/lib/auth-token'
import '@/index.css'

setAuthToken('layout-fixture-token')

function Harness() {
  const [model, setModel] = useState<string | null>('gpt-6.1')
  return <TooltipProvider><ProviderModelSelector provider="codex" model={model}
    onProviderChange={() => {}} onModelChange={setModel} /></TooltipProvider>
}
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<AuthProvider><Harness /></AuthProvider>)
