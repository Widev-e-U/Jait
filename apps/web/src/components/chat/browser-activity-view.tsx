import type { ReactNode } from 'react'
import { ChatBrowserView } from './chat-browser-view'
import { normalizeToolName } from '@/lib/tool-call-body'
import { CheckCircle2, ExternalLink, Globe, Loader2, MousePointer2, XCircle } from 'lucide-react'
import { getBrowserActivity } from '@/lib/browser-activity'

export function BrowserActivityView({ tool, args, data, status, output, children, sessionId, authToken }: {
  tool: string
  args: Record<string, unknown>
  data?: Record<string, unknown>
  status: 'pending' | 'running' | 'success' | 'error'
  output: string
  children?: ReactNode
  sessionId?: string | null
  authToken?: string | null
}) {
  const activity = getBrowserActivity(tool, args, data)
  const running = status === 'running' || status === 'pending'
  const StatusIcon = running ? Loader2 : status === 'error' ? XCircle : CheckCircle2
  const details = activity.textPreview || activity.snapshot
  return (
    <section aria-label="Browser activity" className="my-1 overflow-hidden rounded-lg border border-cyan-500/20 bg-background text-xs">
      <div className="flex min-w-0 items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2">
        <Globe className="h-3.5 w-3.5 shrink-0 text-cyan-500" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium">{activity.title || 'Browser'}</span>
        <span role="status" className={`flex shrink-0 items-center gap-1 ${status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
          <StatusIcon className={`h-3 w-3 ${running ? 'animate-spin' : ''}`} aria-hidden="true" />
          {running ? 'In progress' : status === 'error' ? 'Failed' : 'Done'}
        </span>
      </div>
      {activity.url && (
        <a href={activity.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 border-b border-border/40 px-3 py-2 text-muted-foreground hover:text-foreground" title={activity.url}>
          <span className="min-w-0 flex-1 truncate font-mono">{activity.url}</span>
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="sr-only">Open page</span>
        </a>
      )}
      <ChatBrowserView data={data} sessionId={sessionId} authToken={authToken} autoOpen={['browser.navigate', 'surfaces.start', 'preview.open', 'preview.status', 'preview.restart'].includes(normalizeToolName(tool)) || status === 'error'} />
      {activity.target && (
        <div className="flex items-start gap-2 px-3 py-2">
          <MousePointer2 className="mt-0.5 h-3 w-3 shrink-0 text-cyan-500" aria-hidden="true" />
          <span className="min-w-0 break-all font-mono">{activity.target}</span>
        </div>
      )}
      {activity.notice && <p className="px-3 py-2 text-muted-foreground">{activity.notice}</p>}
      {!activity.suppressed && children}
      {!activity.suppressed && (details || activity.elements.length > 0) && (
        <details className="border-t border-border/40 px-3 py-2">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Page details{activity.elements.length > 0 ? ` · ${activity.elements.length} elements` : ''}</summary>
          {details && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans leading-5">{details}</pre>}
          {activity.elements.length > 0 && (
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto" aria-label="Page elements">
              {activity.elements.map((element, index) => (
                <li key={index} className="flex items-baseline gap-2 rounded bg-muted/30 px-2 py-1">
                  {element.role && <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{element.role}</span>}
                  <span className="min-w-0 break-words">{element.label}</span>
                  {(element.active || element.disabled) && <span className="ml-auto shrink-0 text-muted-foreground">{element.disabled ? 'disabled' : 'focused'}</span>}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
      {!activity.suppressed && output && (
        <details className="border-t border-border/40 px-3 py-2" open={status === 'error'}>
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{status === 'error' ? 'Error details' : 'Tool output'}</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono leading-5">{output}</pre>
        </details>
      )}
    </section>
  )
}
