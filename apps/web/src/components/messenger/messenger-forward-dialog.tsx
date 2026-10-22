import { Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MAX_ATTACHMENT_BYTES, type MessengerMessage } from '@/lib/messenger/model'
import { messageCaption } from '@/lib/messenger/standalone'
import { useMessenger } from './messenger-provider'

/**
 * WhatsApp-style forward picker: pick one or more chats, then the message body
 * and its attachment are copied into each of them. Forwarding is a client-side
 * copy — nothing about the original sender travels with it beyond the content.
 */
export function ForwardDialog({ open, onOpenChange, message, roomId }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  message: MessengerMessage
  /** Chat the message came from — WhatsApp never offers it as a forward target. */
  roomId?: string
}) {
  const { store, snapshot } = useMessenger()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setQuery(''); setPicked([]); setError(''); setBusy(false)
  }, [open])

  const blocked = !!message.pending || !!message.failed || !!message.unableToDecrypt
  const caption = messageCaption(message)
  const hasContent = !!message.attachment || !!caption.trim()

  const rooms = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return snapshot.rooms
      .filter(room => !room.status && room.id !== roomId)
      .filter(room => !needle || room.name.toLowerCase().includes(needle))
      .slice(0, 50)
  }, [snapshot.rooms, query, roomId])

  const toggle = (roomId: string) => setPicked(current =>
    current.includes(roomId) ? current.filter(id => id !== roomId) : [...current, roomId])

  const forward = async () => {
    if (busy || !picked.length || !hasContent || blocked) return
    setBusy(true); setError('')
    try {
      let file: File | null = null
      if (message.attachment) {
        const attachment = message.attachment
        const blob = await store.attachmentBlob(attachment)
        if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error('Attachment exceeds the 20 MB limit.')
        file = new File([blob], attachment.name || 'attachment', { type: attachment.mime || blob.type })
      }
      for (const roomId of picked) {
        // Attachments are re-encrypted for the target room by the store.
        if (file) await store.sendAttachment(roomId, file)
        if (caption.trim()) await store.send(roomId, caption)
      }
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error && cause.message
        ? cause.message
        : 'Could not forward this message. Please try again.')
    } finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Forward message</DialogTitle>
        <DialogDescription>{blocked
          ? 'This message cannot be forwarded.'
          : 'Pick the chats that should receive a copy.'}</DialogDescription>
      </DialogHeader>
      <Input
        autoFocus aria-label="Search chats" placeholder="Search chats" value={query}
        onChange={event => setQuery(event.target.value)}
      />
      <ScrollArea className="max-h-72">
        <ul className="space-y-0.5">
          {rooms.map(room => {
            const selected = picked.includes(room.id)
            return <li key={room.id}>
              <button
                type="button" disabled={busy || blocked || !hasContent}
                aria-pressed={selected} data-room-id={room.id}
                onClick={() => toggle(room.id)}
                className={'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-muted disabled:opacity-50 ' + (selected ? 'bg-muted' : '')}
              >
                <span aria-hidden className={'grid h-4 w-4 shrink-0 place-items-center rounded-full border ' + (selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                  {selected && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{room.name}</span>
                  {room.preview && <span className="block truncate text-xs text-muted-foreground">{room.preview}</span>}
                </span>
              </button>
            </li>
          })}
          {!rooms.length && <li className="px-2 py-6 text-center text-sm text-muted-foreground">No chats match that search.</li>}
        </ul>
      </ScrollArea>
      {!hasContent && <p role="alert" className="text-xs text-destructive">This message has nothing to forward.</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="button" disabled={busy || blocked || !hasContent || !picked.length} onClick={() => void forward()}>
          {busy ? 'Forwarding…' : picked.length > 1 ? `Forward to ${picked.length} chats` : 'Forward'}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
}
