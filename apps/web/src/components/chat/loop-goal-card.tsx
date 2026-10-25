import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, Infinity as InfinityIcon, Pause, Play, Target } from 'lucide-react'
import type { ChatLoop } from '@jait/shared'
import { Button } from '@/components/ui/button'
import { getApiUrl } from '@/lib/gateway-url'

// Match the browser panel's grow/shrink timing and reduced-motion behavior.
const GOAL_TRANSITION = 'transition-[width,height,border-radius,box-shadow] [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none'
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function LoopGoalCard({ loop, sessionId, onControl, mobile = false }: {
  loop: ChatLoop
  sessionId: string
  onControl: (action: 'pause' | 'resume') => Promise<void>
  mobile?: boolean
}) {
  const contentId = useId()
  const storageKey = `jait.chat.goal-collapsed.${sessionId}`
  // On mobile the goal stays a compact icon-and-label trigger until tapped, so
  // it doesn't crowd the fixed header. Desktop keeps its saved expand state.
  const [collapsed, setCollapsed] = useState(() => {
    if (mobile) return true
    try { return localStorage.getItem(storageKey) === 'true' }
    catch { return false }
  })
  // Crossing the mobile breakpoint changes the expected default: compact on
  // mobile, but restored from per-chat storage on desktop.
  useEffect(() => {
    if (mobile) { setCollapsed(true); return }
    try { setCollapsed(localStorage.getItem(storageKey) === 'true') }
    catch { setCollapsed(false) }
  }, [mobile, storageKey])
  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    if (mobile) return
    try { localStorage.setItem(storageKey, String(next)) }
    catch { /* The card still toggles when browser storage is unavailable. */ }
  }
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = loop.status === 'running'
  const completed = loop.status === 'completed'
  const failed = loop.status === 'error'
  const control = async () => {
    setPending(true)
    setError(null)
    try { await onControl(running ? 'pause' : 'resume') }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update loop') }
    finally { setPending(false) }
  }
  const compact = mobile && collapsed
  const frameRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ width: number; height: number } | null>(null)
  // Measure the natural content independently of the animated frame. Keeping
  // that frame mounted lets both expansion and collapse interpolate dimensions.
  useIsomorphicLayoutEffect(() => {
    const frame = frameRef.current
    const content = contentRef.current
    const parent = frame?.parentElement
    if (!frame || !content || !parent) return
    const measure = () => {
      content.style.width = compact ? 'max-content' : `${Math.max(0, parent.clientWidth - 2)}px`
      content.style.maxWidth = `${Math.max(0, parent.clientWidth - 2)}px`
      const rect = content.getBoundingClientRect()
      const next = { width: rect.width + 2, height: rect.height + 2 }
      setBox(current => current?.width === next.width && current.height === next.height ? current : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [compact])

  return (
    <div ref={frameRef} role={compact ? undefined : 'region'} aria-label={compact ? undefined : 'Chat loop goal'} data-testid="loop-goal-card"
      className={`pointer-events-auto max-w-full overflow-hidden border bg-card/95 text-xs shadow-sm backdrop-blur-sm ${compact ? 'rounded-full' : 'rounded-xl'} ${GOAL_TRANSITION}`}
      style={box ?? { width: compact ? 'max-content' : '100%' }}>
      <div ref={contentRef} className={compact ? 'px-3 py-1.5' : 'p-3'}>
        <button type="button" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-controls={contentId} aria-label={collapsed ? 'Expand goal card' : 'Collapse goal card'} className={`flex w-full items-center rounded text-left text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${compact ? 'gap-1.5' : 'gap-2'}`}>
          {!compact && <ChevronDown aria-hidden="true" className={`size-3.5 shrink-0 transition-transform motion-reduce:transition-none ${collapsed ? '-rotate-90' : ''}`} />}
          {failed ? <AlertCircle className="size-3.5 shrink-0 text-destructive" /> : completed ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" /> : <Target className="size-3.5 shrink-0" />}
          <span className="font-medium text-foreground">Goal</span>
          {(!compact || !running) && <span className={`ml-auto flex items-center gap-1 capitalize ${failed ? 'text-destructive' : ''}`} role="status">
            {running && <InfinityIcon className="size-3.5 animate-pulse text-primary motion-reduce:animate-none" />}
            {compact && failed ? 'Stopped · error' : loop.status}
          </span>}
        </button>
        <div id={contentId} hidden={collapsed} className="mt-2">
          <p className="break-words font-medium leading-relaxed">{loop.goal}</p>
          {loop.summary && <p role={failed ? 'alert' : undefined} className={`mt-2 break-words ${failed ? 'text-destructive' : 'line-clamp-4 text-muted-foreground'}`}>{loop.summary}</p>}
          {failed && <p className="mt-2 text-muted-foreground">Automatic continuation stopped. Resolve the error, then resume the goal.</p>}
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
      </div>
    </div>
  )
}

export function ChatLoopGoal({ loop, sessionId, token, mobile = false }: { loop: ChatLoop; sessionId: string; token: string | null; mobile?: boolean }) {
  return <LoopGoalCard key={sessionId} sessionId={sessionId} loop={loop} mobile={mobile} onControl={async action => {
    const response = await fetch(`${getApiUrl()}/api/sessions/${encodeURIComponent(sessionId)}/loop`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new Error(data?.details || 'Could not update loop')
    }
  }} />
}
