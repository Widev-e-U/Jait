import { MessageText } from '@/components/ui/message-text'
import { useMemo } from 'react'
import { ImageIcon } from 'lucide-react'
import { dayDividerLabel, needsDayDivider } from '@/lib/messenger/dates'
import type { MessengerMessage } from '@/lib/messenger/model'
import { MessengerAttachment } from './messenger-message'

function initials(name: string) {
  const trimmed = name.trim()
  return trimmed ? trimmed.slice(0, 2).toUpperCase() : '?'
}

function timeLabel(timestamp: number) {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

/**
 * WhatsApp status broadcasts all arrive as ordinary messages in one Matrix room.
 * They have no reply timeline, so render them as a read-only feed grouped by contact
 * instead of cramming them into the chat transcript.
 */
export function MessengerStatusView({ messages }: { messages: MessengerMessage[] }) {
  const threads = useMemo(() => {
    const bySender = new Map<string, MessengerMessage[]>()
    for (const message of messages) {
      const list = bySender.get(message.sender)
      if (list) list.push(message)
      else bySender.set(message.sender, [message])
    }
    return [...bySender.entries()]
      .map(([sender, items]) => ({ sender, items: items.slice().sort((a, b) => a.timestamp - b.timestamp) }))
      .sort((a, b) => b.items[b.items.length - 1].timestamp - a.items[a.items.length - 1].timestamp)
  }, [messages])

  return <div aria-label="Status updates" className="min-h-0 flex-1 overflow-y-auto">
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4">
      <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Status updates are read-only. Open a contact’s conversation to reply.
      </p>
      {threads.map(thread => <section key={thread.sender} aria-label={'Status from ' + thread.sender} className="space-y-2">
        <header className="flex items-center gap-2.5">
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-400 to-emerald-600 p-[2px]">
            <span className="flex h-full w-full items-center justify-center rounded-full bg-background text-[11px] font-semibold text-emerald-700">{initials(thread.sender)}</span>
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">{thread.sender}</h3>
            <p className="truncate text-[11px] text-muted-foreground">
              {thread.items.length} {thread.items.length === 1 ? 'update' : 'updates'} · latest {timeLabel(thread.items[thread.items.length - 1].timestamp)}
            </p>
          </div>
        </header>
        <div className="space-y-2">
          {thread.items.map((item, index) => {
            const opensDay = needsDayDivider(thread.items[index - 1]?.timestamp, item.timestamp)
            return <div key={item.id} className="space-y-2">
              {opensDay && <p data-day-divider className="mx-auto w-fit rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{dayDividerLabel(item.timestamp)}</p>}
              <article data-status-update-id={item.id} className="max-w-full rounded-xl border bg-card p-2.5 shadow-sm">
                {item.body && <p className={'whitespace-pre-wrap break-words text-sm leading-[1.4] [overflow-wrap:anywhere] ' + (item.unableToDecrypt ? 'italic text-muted-foreground' : '')}><MessageText>{item.body}</MessageText></p>}
                {item.attachment
                  ? <MessengerAttachment key={item.attachment.url} attachment={item.attachment} />
                  : item.unableToDecrypt
                    ? null
                    : !item.body && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ImageIcon className="h-3.5 w-3.5" />Media unavailable</p>}
                <p className="mt-1 text-right text-[10px] text-muted-foreground">
                  <time dateTime={new Date(item.timestamp).toISOString()}>{timeLabel(item.timestamp)}</time>
                </p>
              </article>
            </div>
          })}
        </div>
      </section>)}
      {threads.length === 0 && <div className="space-y-1 py-10 text-center text-sm text-muted-foreground">
        <p>No status updates yet.</p>
        <p className="text-xs">Status updates from your WhatsApp contacts appear here.</p>
      </div>}
    </div>
  </div>
}
