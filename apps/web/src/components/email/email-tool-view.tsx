import { useEffect, useState } from 'react'
import { Mail } from 'lucide-react'
import { emailApi } from '@/lib/email-api'
import { EmailContent } from './email-content'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function text(value: unknown) { return typeof value === 'string' ? value : '' }

export function EmailToolView({ data, args }: { data?: Record<string, unknown>; args: Record<string, unknown> }) {
  const root = record(data)
  const nested = record(root.message)
  const message = Object.keys(nested).length ? nested : root
  const [loaded, setLoaded] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const accountId = text(root.accountId) || text(record(root.account).id) || text(args.accountId)
  const id = text(message.id) || text(args.messageId) || text(args.id)
  const hasBody = typeof message.bodyHtml === 'string' || typeof message.bodyText === 'string'
  useEffect(() => {
    let cancelled = false
    setLoaded(null); setError('')
    if (hasBody || !id || !accountId) return
    void emailApi.getMessage(id, accountId).then(result => { if (!cancelled) setLoaded({ ...result }) }).catch(() => { if (!cancelled) setError('Email unavailable. This account may have been disconnected.') })
    return () => { cancelled = true }
  }, [id, accountId, hasBody])
  const shown = hasBody ? message : loaded
  if (!shown) return <div className="rounded-xl border p-4 text-sm text-muted-foreground" role="status">{error || (accountId && id ? 'Loading email…' : 'Email content unavailable.')}</div>
  return (
    <article className="my-0 min-w-0 overflow-hidden rounded-md border bg-card" aria-label="Email preview">
      <header className="space-y-1 border-b p-2.5 sm:p-4">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground sm:mb-2 sm:gap-2 sm:text-xs"><Mail className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />Email</div>
        <h3 className="break-words text-sm font-semibold sm:text-base">{text(shown.subject) || '(no subject)'}</h3>
        <p className="break-words text-[11px] sm:text-xs"><span className="text-muted-foreground">From: </span>{text(shown.from)}</p>
        {text(shown.to) && <p className="break-words text-[11px] sm:text-xs"><span className="text-muted-foreground">To: </span>{text(shown.to)}</p>}
        {text(shown.date) && <p className="text-[11px] text-muted-foreground sm:text-xs">{text(shown.date)}</p>}
      </header>
      <div className="p-0"><EmailContent key={accountId + id} accountId={accountId || undefined} bodyHtml={text(shown.bodyHtml)} bodyText={text(shown.bodyText) || text(shown.body)} /></div>
    </article>
  )
}
