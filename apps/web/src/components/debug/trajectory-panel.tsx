import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Trash2, Copy, Check, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { clearSSEDebugEvents, useSSEDebugEvents } from './sse-debug-panel'
import type { TrajectoryStep } from './trajectory-builder'
import { buildTrajectory } from './trajectory-builder'

interface TrajectoryPanelProps {
  onClose: () => void
}

const STEP_ROW_HEIGHT = 24

type Role = 'user' | 'assistant' | 'tool' | 'done' | 'error'

const roleStyles: Record<Role, string> = {
  user: 'text-blue-400',
  assistant: 'text-green-400',
  tool: 'text-yellow-400',
  done: 'text-emerald-400',
  error: 'text-red-400',
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
    return <span className="text-zinc-400 truncate">{step.content}</span>
  }
  if (step.kind === 'assistant') {
    return (
      <div className="min-w-0">
        {step.thinking && (
          <div className={cn('text-purple-400/80', expanded ? 'whitespace-pre-wrap' : 'truncate')}>
            <span className="text-purple-500">…thinking </span>
            {step.thinking}
          </div>
        )}
        <div className={expanded ? 'whitespace-pre-wrap break-words' : 'truncate'}>
          {step.text || <span className="text-zinc-600 italic">(no text yet)</span>}
        </div>
      </div>
    )
  }
  if (step.kind === 'tool') {
    return (
      <div className="min-w-0">
        <span className="font-medium text-yellow-300">{step.tool}</span>{' '}
        <span className={cn('text-zinc-500', expanded ? 'whitespace-pre-wrap break-words' : 'truncate')}>
          {step.argsPreview}
        </span>
        {step.result && (
          <span className={cn('block text-emerald-400/90', expanded ? 'whitespace-pre-wrap break-words' : 'truncate')}>
            → {step.result.message}
          </span>
        )}
      </div>
    )
  }
  if (step.kind === 'done') {
    return <span className="text-emerald-400">{step.message}</span>
  }
  // error
  return <span className="text-red-400">{step.message}</span>
}

function StepDetails({ step, onClose }: { step: TrajectoryStep; onClose: () => void }) {
  return (
    <div className="flex flex-col border-t border-zinc-700/60 bg-zinc-900/60">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-700/60">
        <span className="text-2xs font-semibold text-zinc-400 uppercase tracking-wider">
          Step {step.index} {step.turn > 0 ? `· Turn ${step.turn}` : ''}
        </span>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="p-3 overflow-y-auto max-h-64">
        <div className="flex items-center gap-2 mb-2">
          <span className={cn('text-2xs font-bold', roleStyles[step.role])}>{roleLabels[step.role]}</span>
          {step.kind === 'tool' && <span className="text-2xs text-zinc-500">{step.tool}</span>}
        </div>
        <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
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

export function TrajectoryPanel({ onClose }: TrajectoryPanelProps) {
  const events = useSSEDebugEvents()
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
    <div className="flex flex-col h-full bg-[#0d1117] text-[#c9d1d9] text-xs font-mono">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-700/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Trajectory</span>
          <span className="text-2xs text-zinc-500">{steps.length} steps</span>
          {(meta.provider || meta.model) && (
            <span className="flex items-center gap-1.5 truncate text-2xs text-zinc-500">
              {meta.provider && <span className="text-zinc-400">{meta.provider}</span>}
              {meta.provider && meta.model && <span className="text-zinc-600">/</span>}
              {meta.model && <span className="text-blue-400/90">{meta.model}</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <Search className="h-3 w-3 text-zinc-500 absolute left-1.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="h-5 w-32 pl-6 pr-1.5 text-2xs rounded bg-zinc-800 border border-zinc-700 text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleCopy} title="Copy trajectory">
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={clearSSEDebugEvents} title="Clear events">
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
                'flex items-start gap-2 px-2 hover:bg-zinc-800/50 leading-tight cursor-pointer select-none border-b border-zinc-800/40',
                isExpanded || isSelected ? 'py-1 bg-zinc-800/30' : 'py-1',
              )}
              onClick={() => {
                if (hasDetail) toggleExpand(step.index)
                setSelected(step.index)
              }}
            >
              <span className="w-14 shrink-0 text-right font-bold" style={{ minHeight: STEP_ROW_HEIGHT }}>
                <span className={roleStyles[step.role]}>{roleLabels[step.role]}</span>
              </span>
              {hasDetail && (
                <span className="shrink-0 w-3 text-zinc-500">
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
