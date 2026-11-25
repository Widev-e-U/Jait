import { CheckCheck } from 'lucide-react'
import { DeliveryIndicator } from './delivery-indicator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { uniqueReaders, type MessengerReadReceipt } from '@/lib/messenger/model'
import { TooltipHint } from '@/components/ui/tooltip'

export function MessageReadStatus({ readers: rawReaders, inline = false, bridgeStatus }: { readers: MessengerReadReceipt[]; inline?: boolean; bridgeStatus?: 'pending' | 'sent' | 'delivered' | 'failed' }) {
  const readers = uniqueReaders(rawReaders)
  if (!readers.length && inline) {
    if (bridgeStatus === 'failed') return <DeliveryIndicator state="failed" label="Bridge send failed" />
    if (bridgeStatus === 'pending') return <DeliveryIndicator state="sending" label="Bridge processing" />
    if (bridgeStatus === 'delivered') return <DeliveryIndicator state="received" label="Delivered" />
    return <DeliveryIndicator state="sent" label="Sent" />
  }
  if (!readers.length) return <TooltipHint content="Accepted by Matrix. No public read receipt received."><span className="block pt-1 text-right text-2xs text-muted-foreground">Sent</span></TooltipHint>
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label={inline ? 'Read; show receipts' : 'Read receipts'} className={inline ? 'flex items-center' : 'ml-auto flex items-center gap-1 pt-1 text-2xs text-muted-foreground hover:text-foreground'} data-no-message-edit>
        {inline ? <DeliveryIndicator state="read" tooltip={false} className="hover:text-blue-600" /> : <>
          <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {readers.length === 1 ? 'Seen' : `Seen by ${readers.length}`}
        </>}
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
