import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Message } from '@/components/chat/message'
import { MessageQueue, type QueuedMessage } from '@/components/chat/message-queue'
import { PromptInput } from '@/components/chat/prompt-input'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

const attachments = [
  { name: 'photo.png', mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=' },
  { name: 'invoice-with-a-very-long-filename-that-must-fit-on-a-small-phone-screen.txt', mimeType: 'text/plain', data: 'aW52b2ljZSB0b3RhbCA0Mg==' },
]
function Harness() {
  const [value, setValue] = useState('Review the attachments')
  const [items, setItems] = useState<QueuedMessage[]>([{ id: 'q-upload', content: 'Review these files', queuedAt: 1, attachments }])
  return <TooltipProvider><ConfirmDialogProvider>
    <main className="mx-auto max-w-xl space-y-4 p-3">
      <section data-testid="composer"><PromptInput value={value} onChange={setValue} onSubmit={() => {}} initialAttachments={attachments} /></section>
      <section data-testid="queue"><MessageQueue items={items} iconOnly onEdit={(id, content) => setItems(prev => prev.map(item => item.id === id ? { ...item, content } : item))} /></section>
      <section data-testid="sent"><Message role="user" content="Review these files" attachments={attachments} /></section>
    </main>
  </ConfirmDialogProvider></TooltipProvider>
}
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
