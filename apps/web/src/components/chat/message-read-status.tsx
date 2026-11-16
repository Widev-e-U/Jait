import { Check, CheckCheck, Clock, TriangleAlert } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { uniqueReaders, type MessengerReadReceipt } from '@/lib/messenger/model'
import { TooltipHint } from '@/components/ui/tooltip'

export function MessageReadStatus({ readers: rawReaders, inline = false, bridgeStatus }: { readers: MessengerReadReceipt[]; inline?: boolean; bridgeStatus?: 'pending' | 'sent' | 'delivered' | 'failed' }) {
  const readers = uniqueReaders(rawReaders)
  if (!readers.length && inline && bridgeStatus === 'failed') return <TooltipHint content="The bridge could not send this message."><span role="img" aria-label="Bridge send failed" className="inline-flex text-destructive"><TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" /></span></TooltipHint>
  if (!readers.length && inline && bridgeStatus === 'pending') return <TooltipHint content="The bridge is still processing this message."><span role="img" aria-label="Bridge processing" className="inline-flex"><Clock className="h-3.5 w-3.5" aria-hidden="true" /></span></TooltipHint>
  if (!readers.length && inline && bridgeStatus === 'delivered') return <TooltipHint content="The bridge reported delivery to a recipient."><span role="img" aria-label="Delivered" className="inline-flex"><CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /></span></TooltipHint>
  if (!readers.length && inline && bridgeStatus === 'sent') return <TooltipHint content="The bridge sent this message to the service; recipient delivery is unknown."><span role="img" aria-label="Sent to service" className="inline-flex"><Check className="h-3.5 w-3.5" aria-hidden="true" /></span></TooltipHint>
  if (!readers.length && inline) return <TooltipHint content="Sent; no public read receipt received."><span role="img" aria-label="Sent" className="inline-flex"><Check className="h-3.5 w-3.5" aria-hidden="true" /></span></TooltipHint>
  if (!readers.length) return <TooltipHint content="Accepted by Matrix. No public read receipt received."><span className={(inline ? 'whitespace-nowrap' : 'block pt-1 text-right') + ' text-2xs text-muted-foreground'}>Sent</span></TooltipHint>
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label={inline ? "Read; show receipts" : "Read receipts"} className={(inline ? 'text-blue-500 hover:text-blue-600' : 'ml-auto pt-1 text-muted-foreground hover:text-foreground') + ' flex items-center gap-1 text-2xs'} data-no-message-edit>
        <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />{!inline && (readers.length === 1 ? 'Seen' : `Seen by ${readers.length}`)}
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
