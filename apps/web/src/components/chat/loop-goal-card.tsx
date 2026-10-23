import { useId, useState } from 'react'
import { CheckCircle2, ChevronDown, Infinity as InfinityIcon, Pause, Play, Target } from 'lucide-react'
import type { ChatLoop } from '@jait/shared'
import { Button } from '@/components/ui/button'
import { getApiUrl } from '@/lib/gateway-url'

export function LoopGoalCard({ loop, sessionId, onControl }: {
  loop: ChatLoop
  sessionId: string
  onControl: (action: 'pause' | 'resume') => Promise<void>
}) {
  const contentId = useId()
  const storageKey = `jait.chat.goal-collapsed.${sessionId}`
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(storageKey) === 'true' }
    catch { return false }
  })
  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(storageKey, String(next)) }
    catch { /* The card still toggles when browser storage is unavailable. */ }
  }
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = loop.status === 'running'
  const completed = loop.status === 'completed'
  const control = async () => {
    setPending(true)
    setError(null)
    try { await onControl(running ? 'pause' : 'resume') }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update loop') }
    finally { setPending(false) }
  }
  return (
    <section aria-label="Chat loop goal" data-testid="loop-goal-card" className="rounded-xl border bg-card/95 p-3 text-xs shadow-sm backdrop-blur-sm">
      <button type="button" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-controls={contentId} aria-label={collapsed ? 'Expand goal card' : 'Collapse goal card'} className="flex w-full items-center gap-2 rounded text-left text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronDown aria-hidden="true" className={`size-3.5 shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        {completed ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : <Target className="size-3.5" />}
        <span className="font-medium text-foreground">Goal</span>
        <span className="ml-auto flex items-center gap-1 capitalize" role="status">
          {running && <InfinityIcon className="size-3.5 animate-pulse text-primary motion-reduce:animate-none" />}
          {loop.status}
        </span>
      </button>
      <div id={contentId} hidden={collapsed} className="mt-2">
        <p className="break-words font-medium leading-relaxed">{loop.goal}</p>
        {loop.summary && <p className="mt-2 line-clamp-4 break-words text-muted-foreground">{loop.summary}</p>}
        <details className="mt-2 text-muted-foreground">
          <summary className="cursor-pointer">{loop.criteria.length} acceptance {loop.criteria.length === 1 ? 'criterion' : 'criteria'}</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            {loop.criteria.map((criterion, index) => <li key={index} className="break-words">{criterion}{completed && loop.evidence[index] && <p className="mt-1 text-emerald-600 dark:text-emerald-400">{loop.evidence[index]}</p>}</li>)}
          </ol>
        </details>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-muted-foreground">{loop.iteration} turns</span>
          {!completed && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending} onClick={() => void control()} aria-label={running ? 'Pause goal loop' : 'Resume goal loop'}>
            {running ? <Pause /> : <Play />}{running ? 'Pause' : 'Resume'}
          </Button>}
        </div>
        {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
      </div>
    </section>
  )
}

export function ChatLoopGoal({ loop, sessionId, token }: { loop: ChatLoop; sessionId: string; token: string | null }) {
  return <LoopGoalCard key={sessionId} sessionId={sessionId} loop={loop} onControl={async action => {
    const response = await fetch(`${getApiUrl()}/api/sessions/${encodeURIComponent(sessionId)}/loop`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new Error(data?.details || 'Could not update loop')
    }
  }} />
}
