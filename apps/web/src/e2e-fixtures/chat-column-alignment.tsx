import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Message } from '@/components/chat/message'
import { Conversation } from '@/components/chat/conversation'
import {
  getChatColumnClassName,
  getChatComposerBoundaryClassName,
  getChatTranscriptBoundaryClassName,
} from '@/components/chat/message-edit-layout'
import { PromptInput } from '@/components/chat/prompt-input'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

const MESSAGE_TEXT = 'Assistant message aligned with the composer.'

function Harness() {
  const [value, setValue] = useState('')
  return <TooltipProvider><ConfirmDialogProvider>
    <div data-testid="fixture-shell" className="flex h-screen w-full flex-col">
      <div data-testid="fixture-transcript-boundary" className={getChatTranscriptBoundaryClassName()}>
        <Conversation className="h-full w-full" showMinimap={window.innerWidth >= 768}>
          {new URLSearchParams(window.location.search).has('long')
            ? Array.from({ length: 30 }, (_, index) => <Message key={index} role="assistant" content={`${MESSAGE_TEXT} ${index}`} />)
            : <Message role="assistant" content={MESSAGE_TEXT} />}
          <Message role="user" content="A right aligned user message" />
        </Conversation>
      </div>
      <div data-testid="fixture-composer-boundary" className={getChatComposerBoundaryClassName(window.innerWidth < 768)}>
        <div data-testid="fixture-composer-column" className={getChatColumnClassName()}>
          <PromptInput projectName={new URLSearchParams(window.location.search).has('chatId') ? 'Clipboard test' : undefined} chatId={new URLSearchParams(window.location.search).get('chatId') ?? undefined} value={value} onChange={setValue} onSubmit={() => {}} placeholder="Message Jait" />
        </div>
      </div>
    </div>
  </ConfirmDialogProvider></TooltipProvider>
}

const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
