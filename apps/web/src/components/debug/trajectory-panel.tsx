import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  X,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Search,
  ArrowDown,
  Route,
  MessageSquareText,
  Sparkles,
  Gauge,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Radio,
  Terminal,
  FileText,
  Globe2,
  Bot,
  Clock3,
} from 'lucide-react'
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

/** Slack, in px, for treating a scroll position as "at the bottom". */
const BOTTOM_THRESHOLD_PX = 24

/**
 * Whether the timeline should still follow new content after a scroll event.
 *
 * Content streaming in grows `scrollHeight` and fires `scroll` a frame before
 * the pin catches up, so the view legitimately reads as "not at the bottom"
 * while nobody has touched it. Only a scroll the user is actually driving may
 * detach; reaching the bottom always re-attaches.
 */
export function nextStickToBottom(params: {
  distanceFromBottom: number
  stuck: boolean
  userScrolling: boolean
}): boolean {
  if (params.distanceFromBottom < BOTTOM_THRESHOLD_PX) return true
  return params.userScrolling ? false : params.stuck
}

type Role = 'user' | 'assistant' | 'context' | 'tool' | 'done' | 'error'

const roleStyles: Record<Role, {
  label: string
  iconClass: string
  badgeClass: string
}> = {
  user: {
    label: 'Prompt',
    iconClass: 'border-blue-500/20 bg-blue-500/10 text-blue-500',
    badgeClass: 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  assistant: {
    label: 'Assistant',
    iconClass: 'border-violet-500/20 bg-violet-500/10 text-violet-500',
    badgeClass: 'border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  context: {
    label: 'Context',
    iconClass: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-500',
    badgeClass: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  },
  tool: {
    label: 'Tool',
    iconClass: 'border-amber-500/20 bg-amber-500/10 text-amber-500',
    badgeClass: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  done: {
    label: 'Complete',
    iconClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
    badgeClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  error: {
    label: 'Error',
    iconClass: 'border-red-500/20 bg-red-500/10 text-red-500',
    badgeClass: 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400',
  },
}

const roleLabels: Record<Role, string> = Object.fromEntries(
  Object.entries(roleStyles).map(([role, style]) => [role, style.label]),
) as Record<Role, string>

function getToolIcon(tool: string) {
  const normalized = tool.toLowerCase()
  if (normalized.includes('terminal') || normalized === 'execute' || normalized.startsWith('ssh')) return Terminal
  if (normalized.includes('read') || normalized.includes('write') || normalized.includes('edit') || normalized.includes('file')) return FileText
  if (normalized.includes('web') || normalized.includes('browser') || normalized.includes('preview')) return Globe2
  if (normalized.includes('agent') || normalized.includes('thread')) return Bot
  if (normalized.includes('search')) return Search
  return Wrench
}

function getStepIcon(step: TrajectoryStep) {
  if (step.kind === 'turn') return MessageSquareText
  if (step.kind === 'assistant') return Sparkles
  if (step.kind === 'context') return Gauge
  if (step.kind === 'tool') return getToolIcon(step.tool)
  if (step.kind === 'done') return CheckCircle2
  return AlertCircle
}

function getStepTitle(step: TrajectoryStep): string {
  if (step.kind === 'turn') return `Turn ${step.turn}`
  if (step.kind === 'assistant') return step.completedAt ? 'Assistant response' : 'Assistant working'
  if (step.kind === 'context') return 'Context window'
  if (step.kind === 'tool') return step.tool
  if (step.kind === 'done') return 'Turn completed'
  return 'Turn error'
}

function StepContent({ step, expanded }: { step: TrajectoryStep; expanded: boolean }) {
  if (step.kind === 'turn') {
    return <p className={cn('text-sm leading-5 text-foreground/90', expanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-2')}>{step.content}</p>
  }
  if (step.kind === 'assistant') {
    return (
      <div className="min-w-0 space-y-1.5">
        {step.thinking && (
          <div className={cn(
            'rounded-md border border-violet-500/10 bg-violet-500/[0.04] px-2.5 py-1.5 text-xs leading-5 text-muted-foreground',
            expanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-2',
          )}>
            <span className="mr-1 font-medium text-violet-500">Reasoning</span>
            {step.thinking}
          </div>
        )}
        <div className={cn('text-sm leading-5 text-foreground/90', expanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-2')}>
          {step.text || <span className="text-muted-foreground italic">(no text yet)</span>}
        </div>
      </div>
    )
  }
  if (step.kind === 'context') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{step.total.toLocaleString()} of {step.limit.toLocaleString()} tokens</span>
          <span className="font-medium tabular-nums text-foreground">{Math.round(step.ratio * 100)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full', step.ratio >= 0.9 ? 'bg-red-500' : step.ratio >= 0.75 ? 'bg-amber-500' : 'bg-cyan-500')}
            style={{ width: `${Math.min(step.ratio * 100, 100)}%` }}
          />
        </div>
        {step.pruned && <div className="text-2xs text-amber-600 dark:text-amber-400">Older context was compacted</div>}
      </div>
    )
  }
  if (step.kind === 'tool') {
    return (
      <div className="min-w-0 space-y-1.5">
        <div className={cn('font-mono text-xs leading-5 text-muted-foreground', expanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-2')}>
          {step.argsPreview}
        </div>
        {step.result && (
          <div className={cn(
            'flex items-start gap-1.5 text-xs leading-5',
            step.result.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
            expanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-2',
          )}>
            {step.result.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <span>{step.result.message.length > 240 ? `${step.result.message.slice(0, 240)}…` : step.result.message}</span>
          </div>
        )}
      </div>
    )
  }
  if (step.kind === 'done') {
    return <span className="text-sm text-emerald-600 dark:text-emerald-400">{step.message}</span>
  }
  return <span className="text-sm text-red-600 dark:text-red-400">{step.message}</span>
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
  const StepIcon = getStepIcon(step)
  const style = roleStyles[step.role]

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-[min(94%,28rem)] min-h-0 flex-col border-l border-border/70 bg-background/95 shadow-[-18px_0_40px_rgba(0,0,0,0.18)] backdrop-blur md:static md:w-[clamp(21rem,40%,30rem)] md:max-w-[calc(100%-18rem)] md:shadow-none" aria-label="Trajectory step details">
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border', style.iconClass)}>
            <StepIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn('rounded-full border px-2 py-0.5 text-2xs font-medium', style.badgeClass)}>{style.label}</span>
              <span className="truncate text-sm font-medium text-foreground">{getStepTitle(step)}</span>
            </div>
            <div className="mt-0.5 truncate text-2xs text-muted-foreground">
              Step {step.index + 1}{step.turn > 0 ? ` · Turn ${step.turn}` : ''} · {formatTimestamp(step.ts)}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-md" onClick={onClose} title="Close details">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 bg-muted/20 px-3 py-2" role="tablist" aria-label="Trajectory detail sections">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={cn(
              'shrink-0 rounded-md px-2.5 py-1.5 text-2xs font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        {activeTab === 'summary' ? (
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {summaryRows(step).map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-lg border border-border/60 bg-card px-3 py-2">
                <dt className="text-2xs font-medium text-muted-foreground">{label}</dt>
                <dd className={cn(
                  'mt-1 min-w-0 break-words text-xs font-medium text-foreground',
                  label === 'Status' && value === 'Error' && 'text-red-600 dark:text-red-400',
                  label === 'Status' && value === 'Running' && 'text-amber-600 dark:text-amber-400',
                  label === 'Status' && value === 'Complete' && 'text-emerald-600 dark:text-emerald-400',
                )}>{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="rounded-lg border border-border/60 bg-muted/25 p-3">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/85">
              {detailTabText(step, activeTab)}
            </pre>
          </div>
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
  const contentRef = useRef<HTMLDivElement>(null)

  const pinToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const stuck = nextStickToBottom({
      distanceFromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
      stuck: stickToBottomRef.current,
      userScrolling: userScrollingRef.current,
    })
    stickToBottomRef.current = stuck
    setShowScrollToBottom(!stuck)
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
        setShowScrollToBottom(true)
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: true })
    el.addEventListener('touchmove', markUserScroll, { passive: true })
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('touchmove', markUserScroll)
      el.removeEventListener('scroll', handleScroll)
      clearTimeout(userScrollTimerRef.current)
    }
  }, [handleScroll])

  /**
   * Pin to the newest step before paint, and keep it pinned as content lands.
   *
   * A ResizeObserver rather than an effect keyed on the step count: the panel
   * opens on an empty timeline and fills in from the gateway's replay, and
   * most of what arrives during a live turn is text streamed into the step
   * that is *already* last (assistant output, tool stream). Both grow the
   * content's height without appending a step, so a count-keyed effect never
   * fired for them and the view stopped following mid-turn.
   */
  useLayoutEffect(() => {
    const el = scrollRef.current
    const content = contentRef.current
    if (!el || !content) return
    if (stickToBottomRef.current) pinToBottom()
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) pinToBottom()
    })
    observer.observe(content)
    // Resizing the viewport itself (window, details pane) moves the bottom too.
    observer.observe(el)
    return () => observer.disconnect()
  }, [pinToBottom])

  // Opening a panel (or switching sessions) starts pinned at the newest step.
  // The gateway then replays the whole persisted history as a burst of SSE
  // events, and the ResizeObserver above keeps the view glued to the bottom as
  // that history lands — so the replayed log never appears from the top and
  // there is no visible scroll-down; the panel simply opens at the end.
  useLayoutEffect(() => {
    stickToBottomRef.current = true
    setShowScrollToBottom(false)
    pinToBottom()
  }, [sessionId, pinToBottom])

  const scrollToBottom = useCallback(() => {
    stickToBottomRef.current = true
    setShowScrollToBottom(false)
    pinToBottom()
  }, [pinToBottom])

  const handleCopy = () => {
    const text = steps
      .map(s => `${roleLabels[s.role]} ${stepDetailText(s)}`)
      .join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const selectedStep = selected != null ? steps.find(s => s.index === selected) ?? null : null
  const turnCount = steps.reduce((highest, step) => Math.max(highest, step.turn), 0)
  const toolCount = steps.filter(step => step.kind === 'tool').length
  const errorCount = steps.filter(step => step.kind === 'error' || (step.kind === 'tool' && step.result?.ok === false)).length

  return (
    <div className="flex flex-1 min-h-0 min-w-0 flex-col bg-background text-foreground">
      <div className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="flex min-h-14 items-center justify-between gap-3 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
              <Route className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-5">Trajectory</div>
              <div className="truncate text-2xs text-muted-foreground">How this chat moved from prompt to result</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md" onClick={handleCopy} title="Copy trajectory">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md" onClick={() => (sessionId ? sessionTrajectory.clear() : clearSSEDebugEvents())} title="Clear events">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md" onClick={onClose} title="Close trajectory">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 bg-muted/15 px-3 py-2 sm:px-4">
          {sessionId && (
            <span className={cn(
              'inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-2xs font-medium',
              sessionTrajectory.connected
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
            )} title={sessionTrajectory.connected ? 'Live stream connected' : 'Live stream reconnecting…'}>
              <Radio className={cn('h-3 w-3', !sessionTrajectory.connected && 'animate-pulse')} />
              {sessionTrajectory.connected ? 'Live' : 'Reconnecting'}
            </span>
          )}
          <span className="rounded-full border border-border/60 bg-background px-2 py-1 text-2xs text-muted-foreground">
            {turnCount} turn{turnCount === 1 ? '' : 's'}
          </span>
          <span className="rounded-full border border-border/60 bg-background px-2 py-1 text-2xs text-muted-foreground">
            {toolCount} tool{toolCount === 1 ? '' : 's'}
          </span>
          <span className="rounded-full border border-border/60 bg-background px-2 py-1 text-2xs text-muted-foreground">
            {steps.length} steps
          </span>
          {errorCount > 0 && (
            <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-1 text-2xs text-red-600 dark:text-red-400">
              {errorCount} issue{errorCount === 1 ? '' : 's'}
            </span>
          )}
          {meta.provider && (
            <span className="max-w-32 truncate rounded-full border border-border/60 bg-background px-2 py-1 text-2xs text-foreground/80" title={meta.provider}>
              {meta.provider}
            </span>
          )}
          {meta.model && (
            <span className="max-w-48 truncate rounded-full border border-border/60 bg-background px-2 py-1 text-2xs text-muted-foreground" title={meta.model}>
              {meta.model}
            </span>
          )}
          <div className="relative ml-auto min-w-[9rem] flex-1 sm:max-w-52">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Filter trajectory"
              value={filter}
              onChange={event => setFilter(event.target.value)}
              className="h-7 w-full rounded-md border border-input bg-background pl-8 pr-2.5 text-xs text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>
        </div>
      </div>

      <div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-muted/[0.08]" aria-label="Trajectory timeline">
          <div ref={contentRef} className="mx-auto w-full max-w-4xl p-3 sm:p-4">
            {filtered.length === 0 ? (
              <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-card/50 px-6 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Route className="h-5 w-5" />
                </span>
                <div className="mt-3 text-sm font-medium">{steps.length === 0 ? 'No trajectory yet' : 'No matching steps'}</div>
                <div className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                  {steps.length === 0
                    ? 'Activity will appear here as the assistant reasons, uses tools, and completes the turn.'
                    : 'Try a broader search to see more of this run.'}
                </div>
              </div>
            ) : filtered.map((step, position) => {
              const isExpanded = expanded.has(step.index)
              const isSelected = selected === step.index
              const canExpand = step.kind === 'turn' || step.kind === 'tool' || step.kind === 'context' || (step.kind === 'assistant' && Boolean(step.thinking || step.text)) || step.kind === 'error'
              const StepIcon = getStepIcon(step)
              const style = roleStyles[step.role]
              const isLast = position === filtered.length - 1
              return (
                <div key={`${step.role}-${step.index}`} className="relative flex gap-3 pb-3 last:pb-0">
                  {!isLast && <span className="absolute bottom-[-2px] left-[15px] top-8 w-px bg-border/70" aria-hidden="true" />}
                  <span className={cn('relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background', style.iconClass)}>
                    <StepIcon className="h-4 w-4" />
                  </span>
                  <button
                    type="button"
                    className={cn(
                      'group min-w-0 flex-1 rounded-xl border border-border/60 bg-card/80 p-3 text-left shadow-sm transition-all hover:border-border hover:bg-card hover:shadow-md',
                      isSelected && 'border-primary/30 bg-primary/[0.025] ring-1 ring-primary/15',
                    )}
                    aria-selected={isSelected}
                    aria-expanded={canExpand ? isExpanded : undefined}
                    onClick={() => {
                      if (canExpand) toggleExpand(step.index)
                      setSelected(step.index)
                    }}
                  >
                    <div className="mb-2 flex min-w-0 items-center gap-2">
                      <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-2xs font-medium', style.badgeClass)}>{style.label}</span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{getStepTitle(step)}</span>
                      <span className="hidden items-center gap-1 text-2xs tabular-nums text-muted-foreground sm:flex">
                        <Clock3 className="h-3 w-3" />
                        {formatDuration(step)}
                      </span>
                      {canExpand && (
                        <span className="text-muted-foreground transition-colors group-hover:text-foreground">
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </span>
                      )}
                    </div>
                    <StepContent step={step} expanded={isExpanded} />
                    <div className="mt-2 flex items-center gap-2 text-2xs text-muted-foreground">
                      <span>{formatTimestamp(step.ts)}</span>
                      {step.turn > 0 && <><span aria-hidden="true">·</span><span>Turn {step.turn}</span></>}
                      <span className="sm:hidden"><span aria-hidden="true">·</span> {formatDuration(step)}</span>
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {showScrollToBottom && (
          <div className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-full bg-background/95 px-3 text-xs shadow-lg backdrop-blur"
              onClick={scrollToBottom}
              title="Scroll to latest"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              Latest
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
