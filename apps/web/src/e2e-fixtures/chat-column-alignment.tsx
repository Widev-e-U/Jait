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
const LAST_PROMPT = { role: 'user', content: 'A right aligned user message' } as const
const LONG_HISTORY = Array.from({ length: 30 }, (_, index) => {
  if (index === 2) return { role: 'user', kind: 'system-notice', content: 'Background status update' } as const
  if (index % 5 === 0) {
    return { role: 'user', content: `Prompt ${index / 5 + 1}: Could you review the latest layout changes and check that the transcript and composer line up on smaller screens?` } as const
  }
  return { role: 'assistant', content: `${MESSAGE_TEXT} ${index}` } as const
})
const wideMarkdown = `- Nested inline \`long_${'x'.repeat(500)}\`\n\n  | ${Array.from({ length: 12 }, (_, i) => `Column ${i}`).join(' | ')} |\n  | ${Array(12).fill('---').join(' | ')} |\n  | ${Array(12).fill('Some ordinary table content').join(' | ')} |\n\n\`\`\`text\n${'code'.repeat(200)}\n\`\`\`\n\n[Long file](/home/jakob/jait/${'x'.repeat(300)}.ts:12345678901234567890)`

function Harness() {
  const [value, setValue] = useState('')
  const [wideContent, setWideContent] = useState(false)
  const reloadedFixture = new URLSearchParams(window.location.search).has('reloaded')
  const overflowFixture = new URLSearchParams(window.location.search).has('overflow')
  const longHistory = new URLSearchParams(window.location.search).has('long')
  const messages = [...(longHistory ? LONG_HISTORY : [{ role: 'assistant', content: MESSAGE_TEXT } as const]), LAST_PROMPT]
  return <TooltipProvider><ConfirmDialogProvider>
    <div data-testid="fixture-shell" className="flex h-screen w-full flex-col">
      {overflowFixture && <button onClick={() => setWideContent(true)}>Stream wide content</button>}
      <div data-testid="fixture-transcript-boundary" className={getChatTranscriptBoundaryClassName()}>
        <Conversation
          className="h-full w-full"
          showMinimap={window.innerWidth >= 768}
          messageEstimateInputs={messages}
          messageContents={messages.map(message => message.content)}
        >
          {longHistory
            ? LONG_HISTORY.map((message, index) => <Message key={index} {...message} />)
            : <Message
                role="assistant"
                isStreaming={overflowFixture}
                onOpenPath={() => {}}
                content={reloadedFixture ? '' : wideContent ? wideMarkdown : MESSAGE_TEXT}
                segments={reloadedFixture ? [{ type: 'text', content: MESSAGE_TEXT }] : overflowFixture ? [{ type: 'text', content: wideContent ? wideMarkdown : MESSAGE_TEXT }] : undefined}
              />}
          <Message {...LAST_PROMPT} />
        </Conversation>
      </div>
      <div data-testid="fixture-composer-boundary" className={getChatComposerBoundaryClassName(window.innerWidth < 768)}>
        <div data-testid="fixture-composer-column" className={getChatColumnClassName()}>
          <PromptInput variant={new URLSearchParams(window.location.search).has('messenger') ? 'messenger' : 'assistant'} projectName={new URLSearchParams(window.location.search).has('chatId') ? 'Clipboard test' : undefined} chatId={new URLSearchParams(window.location.search).get('chatId') ?? undefined} value={value} onChange={setValue} onSubmit={() => {}} placeholder="Message Jait" />
        </div>
      </div>
    </div>
  </ConfirmDialogProvider></TooltipProvider>
}

const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
