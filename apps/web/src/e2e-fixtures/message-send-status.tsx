import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Message } from '@/components/chat/message'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

function Harness() {
  const [sendState, setSendState] = useState<'sending' | 'sent'>()
  return <ConfirmDialogProvider><TooltipProvider>
    <main className="mx-auto max-w-3xl p-4">
      <button onClick={() => setSendState('sending')}>Start sending</button>
      <button onClick={() => setSendState('sent')}>Confirm sent</button>
      {['a', 'Short message', 'A longer message with enough text to wrap onto several lines on a narrow screen. The status must stay clear of the final line, and no following message should shift when it appears or disappears.'].map((content, index) => (
        <div key={index} data-testid={`message-${index}`}>
          <Message role="user" content={content} messageId={`status-${index}`} sendState={sendState} onEditMessage={() => true} />
        </div>
      ))}
      <div data-testid="following-message"><Message role="assistant" content="Following reply" /></div>
    </main>
  </TooltipProvider></ConfirmDialogProvider>
}

const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
