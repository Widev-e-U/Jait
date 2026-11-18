import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SubAgentAuthProvider, ToolCallCard, type ToolCallInfo } from '@/components/chat/tool-call-card'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

const path = '.jait/shots/provider-selector-390.png'
function Harness() {
  const [sessionId, setSessionId] = useState('image-chat')
  return <TooltipProvider><SubAgentAuthProvider sessionId={sessionId}>
    <button onClick={() => setSessionId('second-chat')}>Switch chat</button>
    {['image.view', 'browser.screenshot'].map(tool => {
      const call: ToolCallInfo = {
        callId: tool, tool, args: { path }, status: 'success',
        startedAt: 1, completedAt: 2,
        result: { ok: true, message: 'Displaying image', data: { path, inline: false } },
      }
      return <section key={tool} data-testid={tool}><ToolCallCard call={call} /></section>
    })}
  </SubAgentAuthProvider></TooltipProvider>
}
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
