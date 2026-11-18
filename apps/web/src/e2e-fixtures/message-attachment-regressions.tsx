import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PromptInput, type PromptInputHandle } from '@/components/chat/prompt-input'
import { Message } from '@/components/chat/message'
import type { ChatAttachment } from '@/hooks/useChat'
import { MessageQueue, type QueuedMessage } from '@/components/chat/message-queue'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { mergeAttachmentsIntoSegments } from '@/lib/message-segment-builders'
import { userMessageTextFromSegments, type UserMessageSegment } from '@/lib/user-message-segments'
import { editQueuedChatMessage } from '@/hooks/useChat'
import '@/index.css'

const image = { name: 'first.png', mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=' }
const second = { ...image, name: 'second.png' }
const document = { name: 'notes.txt', mimeType: 'text/plain', data: 'aGVsbG8=' }
const original: UserMessageSegment[] = [
  { type: 'text', text: 'Before ' }, { type: 'image', ...image },
  { type: 'text', text: ' between ' }, { type: 'image', ...second },
  { type: 'text', text: ' after' }, { type: 'attachment', ...document },
]
function Harness() {
  const [pendingEdit, setPendingEdit] = useState(false)
  const editResolution = useRef<((success: boolean) => void) | null>(null)
  const [value, setValue] = useState('')
  const [segments, setSegments] = useState<UserMessageSegment[]>([])
  const [revision, setRevision] = useState(0)
  const [sent, setSent] = useState<UserMessageSegment[]>(original)
  const [items, setItems] = useState<QueuedMessage[]>([{ id: 'q1', content: 'Before  between  after', displaySegments: original, attachments: [image, second, document], queuedAt: 1 }])
  const ref = useRef<PromptInputHandle>(null)
  const submit = (_files: unknown, attachments?: ChatAttachment[], nextSegments?: UserMessageSegment[]) => {
    setSent(mergeAttachmentsIntoSegments(nextSegments, attachments) ?? [])
    setValue(''); setSegments([]); setRevision(n => n + 1)
  }
  return <TooltipProvider><ConfirmDialogProvider>
    <main className="mx-auto max-w-3xl space-y-6 p-3">
      <section data-testid="composer"><PromptInput key={revision} draftStateKey="regression-composer" ref={ref}
        value={value} segments={segments} onChange={text => { setValue(text); setSegments(ref.current?.getSegments() ?? []) }}
        onSubmit={submit} onQueue={submit} isLoading={new URLSearchParams(window.location.search).has('queue')} /></section>
      <button type="button" onClick={() => setRevision(n => n + 1)}>Remount composer</button>
      <section data-testid="sent"><Message role="user" messageId="regression-user" content={userMessageTextFromSegments(sent)}
        displaySegments={sent} onEditMessage={async (_id, _text, _index, _fromEnd, options) => {
          setPendingEdit(true)
          const success = await new Promise<boolean>(resolve => { editResolution.current = resolve })
          setPendingEdit(false)
          if (!success) return false
          setSent(options?.displaySegments ?? []); return true
        }} /></section>
      {pendingEdit && <div>
        <button onClick={() => editResolution.current?.(true)}>Complete edit</button>
        <button onClick={() => editResolution.current?.(false)}>Reject edit</button>
      </div>}
      <section data-testid="queue"><MessageQueue items={items} iconOnly
        onEdit={(id, content, attachments, displaySegments) => setItems(prev => prev.map(item => item.id === id
          ? editQueuedChatMessage(item, content, attachments, displaySegments) : item))} /></section>
      <pre data-testid="queue-state" className="hidden">{JSON.stringify(items)}</pre>
    </main>
  </ConfirmDialogProvider></TooltipProvider>
}
const mount = window.document.createElement('div')
window.document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
