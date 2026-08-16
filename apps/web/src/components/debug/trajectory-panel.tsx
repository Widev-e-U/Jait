import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Trash2, Copy, Check, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { clearSSEDebugEvents, useSSEDebugEvents } from './sse-debug-panel'
import { useSessionTrajectory } from './use-session-trajectory'
import type { TrajectoryStep } from './trajectory-builder'
import { buildTrajectory } from './trajectory-builder'

interface TrajectoryPanelProps {
  onClose: () => void
  /** Active chat session — when present the panel streams the session's
   *  trajectory (replay of persisted history + live events) from the gateway. */
  sessionId?: string | null
  /** Auth token for the trajectory SSE stream. */
  token?: string | null
}

const STEP_ROW_HEIGHT = 24

type Role = 'user' | 'assistant' | 'tool' | 'done' | 'error'

// Role colours follow Jait's context-indicator palette (--ctx-*): History →
// user turns, Tools → tool calls, Tool Results → tool output, System → the
// model/assistant. done/error use the app's status colours.
const roleStyles: Record<Role, string> = {
  user: 'var(--ctx-history)',
  assistant: 'var(--ctx-system)',
  tool: 'var(--ctx-tools)',
  done: '#10b981',
  error: '#ef4444',
}

const roleLabels: Record<Role, string> = {
  user: 'USER',
  assistant: 'ASSISTANT',
  tool: 'TOOL',
  done: 'DONE',
  error: 'ERROR',
}

function StepContent({ step, expanded }: { step: TrajectoryStep; expanded: boolean }) {
  if (step.kind === 'turn') {
    return <span className="text-muted-foreground truncate">{step.content}</span>
  }
  if (step.kind === 'assistant') {
    return (
      <div className="min-w-0">
        {step.thinking && (
          <div className={cn(expanded ? 'whitespace-pre-wrap' : 'truncate')} style={{ color: 'var(--ctx-system)', opacity: 0.85 }}>
            <span style={{ color: 'var(--ctx-system)' }}>…thinking </span>
            {step.thinking}
          </div>
        )}
        <div className={expanded ? 'whitespace-pre-wrap break-words' : 'truncate'}>
          {step.text || <span className="text-muted-foreground italic">(no text yet)</span>}
        </div>
      </div>
    )
  }
  if (step.kind === 'tool') {
    return (
      <div className="min-w-0">
        <span className="font-medium" style={{ color: 'var(--ctx-tools)' }}>{step.tool}</span>{' '}
        <span className={cn('text-muted-foreground', expanded ? 'whitespace-pre-wrap break-words' : 'truncate')}>
          {step.argsPreview}
        </span>
        {step.result && (
          <span className={cn('block', expanded ? 'whitespace-pre-wrap break-words' : 'truncate')} style={{ color: 'var(--ctx-tool-results)' }}>
            → {step.result.message}
          </span>
        )}
      </div>
    )
  }
  if (step.kind === 'done') {
    return <span className="text-emerald-500">{step.message}</span>
  }
  // error
  return <span className="text-red-500">{step.message}</span>
}

function StepDetails({ step, onClose }: { step: TrajectoryStep; onClose: () => void }) {
  return (
    <div className="flex flex-col border-t border-border/70 bg-muted/40">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/70">
        <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
          Step {step.index} {step.turn > 0 ? `· Turn ${step.turn}` : ''}
        </span>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="p-3 overflow-y-auto max-h-64">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xs font-bold" style={{ color: roleStyles[step.role] }}>{roleLabels[step.role]}</span>
          {step.kind === 'tool' && <span className="text-2xs text-muted-foreground">{step.tool}</span>}
        </div>
        <pre className="text-xs font-mono text-popover-foreground whitespace-pre-wrap break-words leading-relaxed">
          {stepDetailText(step)}
        </pre>
      </div>
    </div>
  )
}

function stepDetailText(step: TrajectoryStep): string {
  switch (step.kind) {
    case 'turn':
      return step.content
    case 'assistant':
      return [
        step.thinking ? `[thinking]\n${step.thinking}` : '',
        step.text ? `[text]\n${step.text}` : '',
      ].filter(Boolean).join('\n\n') || '(empty assistant turn)'
    case 'tool':
      return [
        `[call ${step.callId ? `#${step.callId}` : ''}] ${step.tool}`,
        step.argsPreview ? `[args]\n${step.argsPreview}` : '',
        step.output ? `[output]\n${step.output}` : '',
        step.result ? `[result: ${step.result.ok ? 'ok' : 'error'}]\n${step.result.message}` : '',
      ].filter(Boolean).join('\n\n')
    case 'done':
      return step.message
    case 'error':
      return step.message
  }
}

export function TrajectoryPanel({ onClose, sessionId, token }: TrajectoryPanelProps) {
  // When an active session is available, consume the gateway's per-session
  // trajectory stream (persisted history replay + live events) instead of the
  // in-memory debug log — so the panel shows the session's old data and keeps
  // receiving live events even after a reload or session switch.
  const sessionTrajectory = useSessionTrajectory(sessionId ?? null, token ?? null)
  const globalEvents = useSSEDebugEvents()
  const events = sessionId ? sessionTrajectory.events : globalEvents
  const { meta, steps } = useMemo(() => buildTrajectory(events), [events])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const toggleExpand = useCallback((index: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const filtered = useMemo(() => {
    if (!filter) return steps
    const q = filter.toLowerCase()
    return steps.filter(s => {
      switch (s.kind) {
        case 'turn': return s.content.toLowerCase().includes(q)
        case 'assistant': return s.thinking.toLowerCase().includes(q) || s.text.toLowerCase().includes(q)
        case 'tool': return s.tool.toLowerCase().includes(q) || s.argsPreview.toLowerCase().includes(q) || (s.result?.message ?? '').toLowerCase().includes(q)
        case 'done': case 'error': return s.message.toLowerCase().includes(q)
      }
    })
  }, [steps, filter])

  // ── Auto-scroll (same stick-to-bottom behaviour as the chat) ──
  const stickToBottomRef = useRef(true)
  const userScrollingRef = useRef(false)
  const userScrollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottomRef.current = distanceFromBottom < 24
  }, [])

  // Detach when the user scrolls up (wheel/touch); re-engage only once they
  // return to the bottom, so new streamed steps don't yank the view.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const markUserScroll = () => {
      userScrollingRef.current = true
      clearTimeout(userScrollTimerRef.current)
      userScrollTimerRef.current = setTimeout(() => {
        userScrollingRef.current = false
      }, 300)
    }
    const handleWheel = (e: WheelEvent) => {
      markUserScroll()
      if (e.deltaY < 0 && stickToBottomRef.current) {
        stickToBottomRef.current = false
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: true })
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('scroll', handleScroll)
      clearTimeout(userScrollTimerRef.current)
    }
  }, [handleScroll])

  // Open at the newest step, matching the chat's stick-to-bottom behaviour.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  // Follow newly appended steps while stuck to the bottom (mirrors the chat's
  // streaming auto-scroll).
  const prevStepCountRef = useRef(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (filtered.length > prevStepCountRef.current && stickToBottomRef.current && !userScrollingRef.current) {
      el.scrollTop = el.scrollHeight
    }
    prevStepCountRef.current = filtered.length
  }, [filtered.length])

  const handleCopy = () => {
    const text = steps
      .map(s => `${roleLabels[s.role]} ${stepDetailText(s)}`)
      .join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const selectedStep = selected != null ? filtered.find(s => s.index === selected) ?? null : null

  return (
    <div className="flex flex-col h-full bg-popover text-popover-foreground text-xs font-mono">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/70 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trajectory</span>
          <span className="text-2xs text-muted-foreground">{steps.length} steps</span>
          {(meta.provider || meta.model) && (
            <span className="flex items-center gap-1.5 truncate text-2xs text-muted-foreground">
              {meta.provider && <span className="text-popover-foreground/80">{meta.provider}</span>}
              {meta.provider && meta.model && <span className="text-muted-foreground">/</span>}
              {meta.model && <span style={{ color: 'var(--ctx-history)' }}>{meta.model}</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {sessionId && (
            <span
              title={sessionTrajectory.connected ? 'Live stream connected' : 'Live stream reconnecting…'}
              className={cn(
                'h-1.5 w-1.5 rounded-full shrink-0',
                sessionTrajectory.connected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse',
              )}
            />
          )}
          <div className="relative">
            <Search className="h-3 w-3 text-muted-foreground absolute left-1.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="h-5 w-32 pl-6 pr-1.5 text-2xs rounded bg-muted/60 border border-border text-popover-foreground placeholder-muted-foreground focus:outline-none focus:border-ring"
            />
          </div>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleCopy} title="Copy trajectory">
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => (sessionId ? sessionTrajectory.clear() : clearSSEDebugEvents())} title="Clear events">
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onClose}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Step list (plain flow so the native scrollbar matches the content) */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {filtered.map(step => {
          const isExpanded = expanded.has(step.index)
          const isSelected = selected === step.index
          const hasDetail = step.kind === 'tool' || (step.kind === 'assistant' && (step.thinking || step.text)) || step.kind === 'error'
          return (
            <div
              key={`${step.role}-${step.index}`}
              className={cn(
                'flex items-start gap-2 px-2 hover:bg-muted/40 leading-tight cursor-pointer select-none border-b border-border/40',
                isExpanded || isSelected ? 'py-1 bg-muted/30' : 'py-1',
              )}
              onClick={() => {
                if (hasDetail) toggleExpand(step.index)
                setSelected(step.index)
              }}
            >
              <span className="w-14 shrink-0 text-right font-bold" style={{ minHeight: STEP_ROW_HEIGHT }}>
                <span style={{ color: roleStyles[step.role] }}>{roleLabels[step.role]}</span>
              </span>
              {hasDetail && (
                <span className="shrink-0 w-3 text-muted-foreground">
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <StepContent step={step} expanded={isExpanded} />
              </span>
            </div>
          )
        })}
      </div>

      {/* Selected step details */}
      {selectedStep && <StepDetails step={selectedStep} onClose={() => setSelected(null)} />}
    </div>
  )
}
