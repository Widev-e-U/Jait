import { useState } from 'react'
import { createRoot } from 'react-dom/client'
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

const MESSAGE_TEXT = 'Message text should share its left edge with the prompt text.'

function Harness() {
  const [value, setValue] = useState('')
  return <TooltipProvider><ConfirmDialogProvider>
    <div data-testid="fixture-shell" className="flex h-screen w-full flex-col">
      <div data-testid="fixture-transcript-boundary" className={getChatTranscriptBoundaryClassName()}>
        <Conversation className="h-full w-full" showMinimap={false}>
          <p data-testid="fixture-message-text" className="text-sm">{MESSAGE_TEXT}</p>
        </Conversation>
      </div>
      <div data-testid="fixture-composer-boundary" className={getChatComposerBoundaryClassName(false)}>
        <div className={getChatColumnClassName()}>
          <PromptInput value={value} onChange={setValue} onSubmit={() => {}} placeholder="Message Jait" />
        </div>
      </div>
    </div>
  </ConfirmDialogProvider></TooltipProvider>
}

const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
