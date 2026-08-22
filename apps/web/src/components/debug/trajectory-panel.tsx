import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Trash2, Copy, Check, ChevronDown, ChevronRight, Search, ArrowDown } from 'lucide-react'
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

type Role = 'user' | 'assistant' | 'context' | 'tool' | 'done' | 'error'

// Role colours follow Jait's context-indicator palette (--ctx-*): History →
// user turns, Tools → tool calls, Tool Results → tool output, System → the
// model/assistant. done/error use the app's status colours.
const roleStyles: Record<Role, string> = {
  user: 'var(--ctx-history)',
  assistant: 'var(--ctx-system)',
  context: 'var(--ctx-history)',
  tool: 'var(--ctx-tools)',
  done: '#10b981',
  error: '#ef4444',
}

const roleLabels: Record<Role, string> = {
  user: 'USER',
  assistant: 'ASSISTANT',
  context: 'CONTEXT',
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
  if (step.kind === 'context') {
    return (
      <span className="text-muted-foreground">
        {step.total.toLocaleString()} / {step.limit.toLocaleString()} tokens
        <span className="ml-2" style={{ color: roleStyles.context }}>{Math.round(step.ratio * 100)}%</span>
        {step.pruned && <span className="ml-2 text-amber-500">pruned</span>}
      </span>
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
            → {step.result.message.length > 200 ? `${step.result.message.slice(0, 200)}…` : step.result.message}
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

type DetailTab = 'summary' | 'prompt' | 'thinking' | 'output' | 'payload' | 'stream' | 'result' | 'usage' | 'timing'

interface DetailTabItem {
  id: DetailTab
  label: string
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  })
}

function stepCompletedAt(step: TrajectoryStep): number | undefined {
  return step.kind === 'assistant' || step.kind === 'tool' ? step.completedAt : undefined
}

function formatDuration(step: TrajectoryStep): string {
  const completedAt = stepCompletedAt(step)
  if (completedAt === undefined) return step.kind === 'assistant' || step.kind === 'tool' ? 'Running' : '—'
  const duration = Math.max(0, completedAt - step.ts)
  return duration < 1_000 ? `${duration} ms` : `${(duration / 1_000).toFixed(duration < 10_000 ? 2 : 1)} s`
}

function detailTabs(step: TrajectoryStep): DetailTabItem[] {
  const tabs: DetailTabItem[] = [{ id: 'summary', label: 'Summary' }]
  if (step.kind === 'turn') tabs.push({ id: 'prompt', label: 'Prompt' })
  if (step.kind === 'assistant') {
    if (step.thinking) tabs.push({ id: 'thinking', label: 'Reasoning' })
    if (step.text) tabs.push({ id: 'output', label: 'Output' })
  }
  if (step.kind === 'context') tabs.push({ id: 'usage', label: 'Usage' })
  if (step.kind === 'tool') {
    tabs.push({ id: 'payload', label: 'Payload' })
    if (step.output) tabs.push({ id: 'stream', label: 'Stream' })
    if (step.result) tabs.push({ id: 'result', label: 'Result' })
  }
  if (step.kind === 'done' || step.kind === 'error') tabs.push({ id: 'result', label: 'Result' })
  tabs.push({ id: 'timing', label: 'Timing' })
  return tabs
}

function summaryRows(step: TrajectoryStep): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['Status', step.kind === 'error' || (step.kind === 'tool' && step.result?.ok === false)
      ? 'Error'
      : stepCompletedAt(step) === undefined && (step.kind === 'assistant' || step.kind === 'tool')
        ? 'Running'
        : 'Complete'],
    ['Event', roleLabels[step.role]],
    ['Turn', step.turn > 0 ? String(step.turn) : '—'],
    ['Step', `#${step.index}`],
  ]
  if (step.kind === 'turn') {
    if (step.provider) rows.push(['Provider', step.provider])
    if (step.model) rows.push(['Model', step.model])
    if (step.mode) rows.push(['Mode', step.mode])
    if (step.runtimeMode) rows.push(['Runtime', step.runtimeMode])
  }
  if (step.kind === 'assistant') {
    rows.push(['Reasoning', `${step.thinking.length.toLocaleString()} chars`])
    rows.push(['Output', `${step.text.length.toLocaleString()} chars`])
  }
  if (step.kind === 'context') {
    rows.push(['Total', `${step.total.toLocaleString()} tokens`])
    rows.push(['Limit', `${step.limit.toLocaleString()} tokens`])
    rows.push(['Used', `${Math.round(step.ratio * 100)}%`])
    rows.push(['Pruned', step.pruned ? 'Yes' : 'No'])
  }
  if (step.kind === 'tool') {
    rows.push(['Tool', step.tool])
    if (step.callId) rows.push(['Call ID', step.callId])
    if (step.parentCallId) rows.push(['Parent call', step.parentCallId])
    rows.push(['Stream output', `${step.output.length.toLocaleString()} chars`])
  }
  if (step.kind === 'done') {
    if (step.sessionId) rows.push(['Session', step.sessionId])
    if (step.promptCount !== undefined) rows.push(['Prompt count', String(step.promptCount)])
  }
  return rows
}

function detailTabText(step: TrajectoryStep, tab: DetailTab): string {
  if (tab === 'prompt' && step.kind === 'turn') return step.content
  if (tab === 'thinking' && step.kind === 'assistant') return step.thinking || '(no reasoning recorded)'
  if (tab === 'output' && step.kind === 'assistant') return step.text || '(no output recorded)'
  if (tab === 'usage' && step.kind === 'context') {
    return [
      `System        ${step.system.toLocaleString()} tokens`,
      `History       ${step.history.toLocaleString()} tokens`,
      `Tool results  ${step.toolResults.toLocaleString()} tokens`,
      `Tool schemas  ${step.tools.toLocaleString()} tokens`,
      `Total         ${step.total.toLocaleString()} tokens`,
      `Limit         ${step.limit.toLocaleString()} tokens`,
      `Used          ${(step.ratio * 100).toFixed(1)}%`,
      `Pruned        ${step.pruned ? 'Yes' : 'No'}`,
    ].join('\n')
  }
  if (tab === 'payload' && step.kind === 'tool') return step.args || '{}'
  if (tab === 'stream' && step.kind === 'tool') return step.output || '(no streamed output)'
  if (tab === 'result') {
    if (step.kind === 'tool') {
      return [
        step.result?.message ?? '(no result)',
        step.result?.data ? `[data]\n${step.result.data}` : '',
      ].filter(Boolean).join('\n\n')
    }
    if (step.kind === 'done' || step.kind === 'error') return step.message
  }
  if (tab === 'timing') {
    return [
      `Started    ${formatTimestamp(step.ts)}`,
      `Timestamp  ${step.ts}`,
      `Duration   ${formatDuration(step)}`,
      ...(stepCompletedAt(step) === undefined
        ? []
        : [`Completed  ${formatTimestamp(stepCompletedAt(step)!)}`]),
    ].join('\n')
  }
  return stepDetailText(step)
}

function StepDetails({ step, onClose }: { step: TrajectoryStep; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<DetailTab>('summary')
  const tabs = detailTabs(step)

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-[min(92%,26rem)] min-h-0 flex-col border-l border-border/70 bg-popover shadow-[-12px_0_32px_rgba(0,0,0,0.16)] md:static md:w-[clamp(20rem,38%,28rem)] md:max-w-[calc(100%-17.5rem)] md:shadow-none" aria-label="Trajectory step details">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-2xs font-bold" style={{ color: roleStyles[step.role] }}>{roleLabels[step.role]}</span>
          <span className="truncate text-2xs text-muted-foreground">
            Step #{step.index}{step.turn > 0 ? ` · Turn ${step.turn}` : ''}
            {step.kind === 'tool' ? ` · ${step.tool}` : ''}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClose} title="Close details">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border/70 px-2 pt-1" role="tablist" aria-label="Trajectory detail sections">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={cn(
              'shrink-0 border-b-2 px-2 py-1.5 text-2xs transition-colors',
              activeTab === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {activeTab === 'summary' ? (
          <dl className="grid grid-cols-[minmax(5rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
            {summaryRows(step).map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className={cn(
                  'min-w-0 break-words text-right text-popover-foreground',
                  label === 'Status' && value === 'Error' && 'text-red-500',
                  label === 'Status' && value === 'Running' && 'text-amber-500',
                )}>{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-popover-foreground">
            {detailTabText(step, activeTab)}
          </pre>
        )}
      </div>
    </aside>
  )
}

function stepDetailText(step: TrajectoryStep): string {
  switch (step.kind) {
    case 'turn':
      return [
        `[prompt]\n${step.content}`,
        step.provider ? `[provider] ${step.provider}` : '',
        step.model ? `[model] ${step.model}` : '',
        step.mode ? `[mode] ${step.mode}` : '',
        step.runtimeMode ? `[runtime] ${step.runtimeMode}` : '',
      ].filter(Boolean).join('\n\n')
    case 'assistant':
      return [
        step.thinking ? `[reasoning]\n${step.thinking}` : '',
        step.text ? `[output]\n${step.text}` : '',
      ].filter(Boolean).join('\n\n') || '(empty assistant turn)'
    case 'context':
      return [
        `[context] ${step.total}/${step.limit} tokens (${(step.ratio * 100).toFixed(1)}%)`,
        `[system] ${step.system}`,
        `[history] ${step.history}`,
        `[tool results] ${step.toolResults}`,
        `[tool schemas] ${step.tools}`,
        step.pruned ? '[pruned] yes' : '',
      ].filter(Boolean).join('\n')
    case 'tool':
      return [
        `[call${step.callId ? ` #${step.callId}` : ''}] ${step.tool}`,
        step.parentCallId ? `[parent call] ${step.parentCallId}` : '',
        step.args ? `[payload]\n${step.args}` : '',
        step.output ? `[stream]\n${step.output}` : '',
        step.result ? `[result: ${step.result.ok ? 'ok' : 'error'}]\n${step.result.message}` : '',
        step.result?.data ? `[data]\n${step.result.data}` : '',
      ].filter(Boolean).join('\n\n')
    case 'done':
      return [
        step.message,
        step.sessionId ? `[session] ${step.sessionId}` : '',
        step.promptCount !== undefined ? `[prompt count] ${step.promptCount}` : '',
      ].filter(Boolean).join('\n')
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
        case 'context': return 'context usage tokens pruned'.includes(q)
        case 'tool': return s.tool.toLowerCase().includes(q) || s.argsPreview.toLowerCase().includes(q) || (s.result?.message ?? '').toLowerCase().includes(q)
        case 'done': case 'error': return s.message.toLowerCase().includes(q)
      }
    })
  }, [steps, filter])

  // ── Auto-scroll (same stick-to-bottom behaviour as the chat) ──
  const stickToBottomRef = useRef(true)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const userScrollingRef = useRef(false)
  const userScrollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distanceFromBottom < 24
    stickToBottomRef.current = atBottom
    setShowScrollToBottom(!atBottom)
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

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) {
      stickToBottomRef.current = true
      setShowScrollToBottom(false)
      el.scrollTop = el.scrollHeight
    }
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

  const selectedStep = selected != null ? steps.find(s => s.index === selected) ?? null : null

  return (
    <div className="flex flex-1 min-h-0 min-w-0 flex-col bg-popover text-popover-foreground text-xs font-mono">
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

      <div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden">
        {/* Step list (plain flow so the native scrollbar matches the content) */}
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden" aria-label="Trajectory timeline">
          {filtered.map(step => {
            const isExpanded = expanded.has(step.index)
            const isSelected = selected === step.index
            const canExpand = step.kind === 'tool' || (step.kind === 'assistant' && (step.thinking || step.text)) || step.kind === 'error'
            return (
              <div
                key={`${step.role}-${step.index}`}
                className={cn(
                  'flex items-start gap-2 border-b border-border/40 px-2 py-1 leading-tight cursor-pointer select-none hover:bg-muted/40',
                  isSelected && 'bg-muted/50',
                  isExpanded && 'bg-muted/30',
                )}
                aria-selected={isSelected}
                onClick={() => {
                  if (canExpand) toggleExpand(step.index)
                  setSelected(step.index)
                }}
              >
                <span className="w-14 shrink-0 text-right font-bold" style={{ minHeight: STEP_ROW_HEIGHT }}>
                  <span style={{ color: roleStyles[step.role] }}>{roleLabels[step.role]}</span>
                </span>
                <span className="w-3 shrink-0 text-muted-foreground">
                  {canExpand
                    ? isExpanded
                      ? <ChevronDown className="h-3 w-3" />
                      : <ChevronRight className="h-3 w-3" />
                    : null}
                </span>
                <span className="min-w-0 flex-1">
                  <StepContent step={step} expanded={isExpanded} />
                </span>
                <span className="hidden shrink-0 text-2xs text-muted-foreground lg:block">
                  {formatDuration(step)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Scroll-to-bottom indicator (same as the SSE debug panel / chat) */}
        {showScrollToBottom && (
          <div className="absolute bottom-2 left-4 z-30">
            <Button
              variant="outline"
              size="icon"
              className="h-6 w-6 rounded-full bg-muted border-border"
              onClick={scrollToBottom}
              title="Scroll to latest"
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
          </div>
        )}

        {selectedStep && (
          <StepDetails key={selectedStep.index} step={selectedStep} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  )
}
