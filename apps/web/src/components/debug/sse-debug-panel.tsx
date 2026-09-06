import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Trash2, ArrowDown, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TooltipHint } from '@/components/ui/tooltip'

export interface SSEDebugEvent {
  id: number
  ts: number
  type: string
  raw: string
}

/**
 * Global SSE debug log — useChat pushes events here, the panel reads them.
 * Kept outside React to avoid rerenders on every event.
 */
const MAX_EVENTS = 5_000
let _nextId = 0
let _events: SSEDebugEvent[] = []
let _listeners: Set<() => void> = new Set()

export function pushSSEDebugEvent(type: string, raw: string) {
  _events.push({ id: _nextId++, ts: Date.now(), type, raw })
  if (_events.length > MAX_EVENTS) _events = _events.slice(-MAX_EVENTS)
  _listeners.forEach(fn => fn())
}

export function clearSSEDebugEvents() {
  _events = []
  _listeners.forEach(fn => fn())
}

export function useSSEDebugEvents() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const listener = () => setTick(t => t + 1)
    _listeners.add(listener)
    return () => { _listeners.delete(listener) }
  }, [])
  return _events
}

interface SSEDebugPanelProps {
  onClose: () => void
}

// Event colours follow Jait's context-indicator palette (--ctx-*): History →
// requests, Tools → tool call deltas/starts, Tool Results → tool output/result,
// System → thinking. done/error use the app's status colours.
const typeColors: Record<string, string> = {
  request: 'var(--ctx-history)',
  token: 'var(--muted-foreground)',
  tool_call_delta: 'var(--ctx-tools)',
  tool_start: 'var(--ctx-tools)',
  tool_output: 'var(--ctx-tool-results)',
  tool_result: 'var(--ctx-tool-results)',
  thinking: 'var(--ctx-system)',
  done: '#10b981',
  error: '#ef4444',
}

const ROW_HEIGHT = 20

export function SSEDebugPanel({ onClose }: SSEDebugPanelProps) {
  const events = useSSEDebugEvents()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggleExpand = useCallback((eventId: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }, [])

  const filtered = filter
    ? events.filter(e => e.type.includes(filter) || e.raw.includes(filter))
    : events

  const handleCopy = () => {
    const text = filtered
      .map(e => `${new Date(e.ts).toISOString().slice(11, 23)} ${e.type} ${e.raw}`)
      .join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    const el = scrollRef.current
    if (el && autoScroll && filtered.length > 0) {
      el.scrollTop = el.scrollHeight
    }
  }, [filtered.length, autoScroll])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }, [])

  return (
    <div className="flex flex-col h-full bg-popover text-popover-foreground text-xs font-mono">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/70 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SSE Debug</span>
          <span className="text-2xs text-muted-foreground">{filtered.length}/{events.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <input
            type="text"
            placeholder="Filter..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="h-5 w-28 px-1.5 text-2xs rounded bg-muted/60 border border-border text-popover-foreground placeholder-muted-foreground focus:outline-none focus:border-ring"
          />
          <TooltipHint content="Copy all events">
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          </Button>
          </TooltipHint>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={clearSSEDebugEvents}>
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onClose}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Event stream (plain flow so the native scrollbar matches the content) */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        {filtered.map(ev => {
          const time = new Date(ev.ts).toISOString().slice(11, 23)
          const color = typeColors[ev.type] ?? 'var(--muted-foreground)'
          const isLong = ev.raw.length > 120
          const isExpanded = expanded.has(ev.id)
          const display = isLong && !isExpanded ? ev.raw.slice(0, 120) + '…' : ev.raw
          return (
            <div
              key={ev.id}
              className={cn(
                'flex gap-2 px-2 hover:bg-muted/40 leading-tight cursor-pointer select-none',
                isExpanded ? 'items-start py-1 bg-muted/30' : 'items-center',
              )}
              onClick={() => toggleExpand(ev.id)}
            >
              <span className="text-muted-foreground shrink-0 w-20" style={{ minHeight: ROW_HEIGHT }}>{time}</span>
              <span className="shrink-0 w-28 text-right" style={{ minHeight: ROW_HEIGHT, color }}>{ev.type}</span>
              <span
                className={cn(
                  'text-muted-foreground min-w-0',
                  isExpanded ? 'break-all whitespace-pre-wrap' : 'truncate',
                )}
              >
                {display}
                {isLong && !isExpanded && <span className="text-muted-foreground ml-1">▸</span>}
              </span>
            </div>
          )
        })}
      </div>

      {/* Scroll-to-bottom indicator */}
      {!autoScroll && (
        <div className="absolute bottom-2 right-4">
          <Button
            variant="outline"
            size="icon"
            className="h-6 w-6 rounded-full bg-muted border-border"
            onClick={() => {
              setAutoScroll(true)
              const el = scrollRef.current
              if (el) el.scrollTop = el.scrollHeight
            }}
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  )
}
