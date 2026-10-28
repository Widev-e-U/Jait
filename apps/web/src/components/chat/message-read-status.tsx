import { CheckCheck } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { uniqueReaders, type MessengerReadReceipt } from '@/lib/messenger/model'
import { TooltipHint } from '@/components/ui/tooltip'

export function MessageReadStatus({ readers: rawReaders, inline = false }: { readers: MessengerReadReceipt[]; inline?: boolean }) {
  const readers = uniqueReaders(rawReaders)
  if (!readers.length) return <TooltipHint content="Accepted by Matrix. No public read receipt received."><span className={(inline ? 'whitespace-nowrap' : 'block pt-1 text-right') + ' text-2xs text-muted-foreground'}>Sent</span></TooltipHint>
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label="Read receipts" className={(inline ? '' : 'ml-auto pt-1 ') + 'flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground'} data-no-message-edit>
        <CheckCheck className="h-3.5 w-3.5" />{readers.length === 1 ? 'Seen' : `Seen by ${readers.length}`}
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="max-h-72 w-72 overflow-auto">
      <p className="mb-2 text-sm font-medium">Read receipts</p>
      <ul className="space-y-2">{readers.map(reader => <li key={reader.userId} className="text-xs">
        <TooltipHint content={reader.userId}><p className="truncate font-medium">{reader.name}</p></TooltipHint>
        <p className="text-muted-foreground">{reader.timestamp ? <>{reader.exact ? 'Read at ' : 'Read by '}<time dateTime={new Date(reader.timestamp).toISOString()}>{new Date(reader.timestamp).toLocaleString()}</time></> : 'Read time unavailable'}</p>
      </li>)}</ul>
      <p className="mt-3 text-2xs text-muted-foreground">“Read by” uses a later receipt; the first-read time is unknown. Bridged services may not provide receipts.</p>
    </PopoverContent>
  </Popover>
}
