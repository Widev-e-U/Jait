import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Message } from '@/components/chat/message'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import '@/index.css'

const LONG = 'This is a long user message that should wrap across several lines so we can check whether the send status indicator overlaps the last line of text on narrow viewports.'

type ReproState = 'none' | 'sending' | 'sent'

function SendStatusRepro() {
  const [state, setState] = useState<ReproState>('sending')
  const sendState = state === 'none' ? undefined : state
  return (
    <ConfirmDialogProvider>
      <TooltipProvider>
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-4">
          <div className="flex gap-3">
            <button type="button" onClick={() => setState('none')}>none</button>
            <button type="button" onClick={() => setState('sending')}>sending</button>
            <button type="button" onClick={() => setState('sent')}>sent</button>
          </div>
          <Message role="user" content="Short message" sendState={sendState} messageId="m1" />
          <Message role="user" content={LONG} sendState={sendState} messageId="m2" />
          <Message role="assistant" content="Assistant reply" messageId="m3" />
        </main>
      </TooltipProvider>
    </ConfirmDialogProvider>
  )
}

createRoot(document.getElementById('root')!).render(<SendStatusRepro />)
