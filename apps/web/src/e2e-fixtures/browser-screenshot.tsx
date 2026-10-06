import { useState } from 'react'
import { AssistantMarkdown } from '@/components/chat/assistant-markdown'
import { createRoot } from 'react-dom/client'
import { ToolCallCard } from '@/components/chat/tool-call-card'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setAuthToken } from '@/lib/auth-token'

// Simulate the token-only desktop client: no gateway auth cookie.
if (!new URLSearchParams(window.location.search).has('web')) {
  Object.assign(window, { jaitDesktop: { gatewayUrl: window.location.origin } })
  setAuthToken('screenshot-test-token')
}

const mount = document.createElement('div')
document.body.replaceChildren(mount)
function Harness() {
  const [path, setPath] = useState('/project/.jait/shots/browser-test.png')
  const [visible, setVisible] = useState(true)
  return <TooltipProvider>
    <button onClick={() => setVisible(false)}>Unmount screenshot</button>
    <button onClick={() => setPath('/project/.jait/shots/next.png')}>Change screenshot</button>
    <button onClick={() => setPath('https://external.test/image.png')}>External screenshot</button>
    {visible && <ToolCallCard call={{
      callId: 'screenshot-test', tool: 'browser.screenshot', args: {},
      status: 'success', startedAt: 1, completedAt: 2,
      result: { ok: true, message: 'browser.screenshot executed', data: { result: { path } } },
    }} />}
    {new URLSearchParams(window.location.search).has('markdown') && <AssistantMarkdown content="![Markdown screenshot](/project/.jait/shots/markdown.png)" />}
  </TooltipProvider>
}
createRoot(mount).render(<Harness />)
