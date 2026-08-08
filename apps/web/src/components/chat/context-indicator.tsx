import { useMemo, useState } from 'react'
import type { ContextUsage, ChatMessage } from '@/hooks/useChat'
import { aggregateSessionMetrics } from '@/lib/chat-session-metrics'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ContextIndicatorProps {
  usage: ContextUsage | null
  /** Chat messages used to derive session-level performance metrics. */
  messages?: ChatMessage[]
  /** Compact (mobile) sizing so the chat header stays uncluttered. */
  compact?: boolean
}

/**
 * Small donut chart showing context window usage with a tooltip
 * breakdown. Clicking opens a detail dialog that also surfaces
 * session-level performance metrics (tokens written, speed, text volume).
 */
export function ContextIndicator({ usage, messages, compact }: ContextIndicatorProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const pct = usage && usage.limit > 0 ? Math.round(usage.ratio * 100) : 0

  // Scanning message bodies is unnecessary during normal chat rendering and
  // becomes noticeable on long/streaming conversations. Do it only when the
  // user asks for the details dialog.
  const sessionMetrics = useMemo(
    () => dialogOpen ? aggregateSessionMetrics(messages) : aggregateSessionMetrics(undefined),
    [dialogOpen, messages],
  )
  const hasSessionMetrics = dialogOpen && (
    sessionMetrics.assistantTurns > 0 ||
    sessionMetrics.completionTokens > 0 ||
    sessionMetrics.promptTokens > 0 ||
    sessionMetrics.textWritten > 0 ||
    sessionMetrics.totalDurationMs > 0 ||
    sessionMetrics.tokensPerSecond != null
  )

  // Category percentages (of total used)
  const categories = useMemo(() => {
    if (!usage || usage.total === 0) return []
    const t = usage.total
    return [
      { label: 'System',      tokens: usage.system,      pct: Math.round((usage.system / t) * 100),      color: 'var(--ctx-system)' },
      { label: 'History',     tokens: usage.history,     pct: Math.round((usage.history / t) * 100),      color: 'var(--ctx-history)' },
      { label: 'Tool Results',tokens: usage.toolResults, pct: Math.round((usage.toolResults / t) * 100), color: 'var(--ctx-tool-results)' },
      { label: 'Tools',       tokens: usage.tools,       pct: Math.round((usage.tools / t) * 100),       color: 'var(--ctx-tools)' },
    ].filter(c => c.tokens > 0)
  }, [usage])

  // SVG donut arcs
  const iconSize = compact ? 18 : 22
  const iconStroke = compact ? 2.5 : 3
  const size = iconSize
  const strokeWidth = iconStroke
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  // Build arcs for each category
  const arcs = useMemo(() => {
    if (!usage || usage.limit <= 0) return []
    const result: { offset: number; length: number; color: string }[] = []
    let accumulated = 0
    for (const cat of categories) {
      const catRatio = cat.tokens / usage.limit
      const length = catRatio * circumference
      result.push({ offset: accumulated, length, color: cat.color })
      accumulated += length
    }
    return result
  }, [categories, usage, circumference])

  // Color based on usage level
  const ringColor = pct >= 90 ? 'text-red-500' : pct >= 75 ? 'text-amber-500' : 'text-emerald-500'

  const formatTokens = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
    return String(n)
  }

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
    return String(n)
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  if (!usage || usage.limit <= 0) return null

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
          >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={`-rotate-90 ${ringColor}`}>
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                opacity={0.15}
              />
              {arcs.map((arc, i) => (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${arc.length} ${circumference - arc.length}`}
                  strokeDashoffset={-arc.offset}
                  strokeLinecap="round"
                  opacity={0.85}
                />
              ))}
            </svg>
            <span className="text-2xs tabular-nums text-muted-foreground">{pct}%</span>
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="max-w-[220px] bg-popover text-popover-foreground border shadow-md"
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium">
              <span>Context Window</span>
              <span className="tabular-nums">{formatTokens(usage.total)} / {formatTokens(usage.limit)}</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <div className="space-y-0.5">
              {categories.map(cat => (
                <div key={cat.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="text-muted-foreground">{cat.label}</span>
                  </div>
                  <span className="tabular-nums text-muted-foreground">{cat.pct}%</span>
                </div>
              ))}
            </div>
            {usage.pruned && (
              <div className="text-2xs text-amber-500 pt-0.5 border-t border-border">
                Old messages pruned to fit context
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Context Window Breakdown</DialogTitle>
            <DialogDescription className="text-xs">
              {formatTokens(usage.total)} / {formatTokens(usage.limit)} tokens used ({pct}%)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <div className="space-y-2">
              {categories.map(cat => (
                <div key={cat.label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span>{cat.label}</span>
                  </div>
                  <div className="text-muted-foreground tabular-nums">
                    <span className="font-medium text-foreground">{formatTokens(cat.tokens)}</span>
                    {' '}
                    <span className="text-xs">({cat.pct}%)</span>
                  </div>
                </div>
              ))}
            </div>
            {usage.pruned && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-600">
                Older messages were pruned to fit within the context window limit.
              </div>
            )}
          </div>

          {hasSessionMetrics && (
            <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground/80">Session Performance</span>
                <span className="text-muted-foreground tabular-nums">
                  {sessionMetrics.assistantTurns} turn{sessionMetrics.assistantTurns !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {sessionMetrics.completionTokens > 0 && (
                  <div className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                    <div className="text-xs text-muted-foreground">Tokens written</div>
                    <div className="text-sm font-semibold text-foreground tabular-nums">
                      {formatNumber(sessionMetrics.completionTokens)} <span className="text-xs font-normal text-muted-foreground">out</span>
                    </div>
                  </div>
                )}
                {sessionMetrics.promptTokens > 0 && (
                  <div className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                    <div className="text-xs text-muted-foreground">Prompt tokens</div>
                    <div className="text-sm font-semibold text-foreground tabular-nums">
                      {formatNumber(sessionMetrics.promptTokens)} <span className="text-xs font-normal text-muted-foreground">in</span>
                    </div>
                  </div>
                )}
                {sessionMetrics.tokensPerSecond != null && (
                  <div className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                    <div className="text-xs text-muted-foreground">Avg speed</div>
                    <div className="text-sm font-semibold text-foreground tabular-nums">
                      {sessionMetrics.tokensPerSecond.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">tok/s</span>
                    </div>
                  </div>
                )}
                {sessionMetrics.totalDurationMs > 0 && (
                  <div className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                    <div className="text-xs text-muted-foreground">Total time</div>
                    <div className="text-sm font-semibold text-foreground tabular-nums">
                      {formatDuration(sessionMetrics.totalDurationMs)}
                    </div>
                  </div>
                )}
                {sessionMetrics.textWritten > 0 && (
                  <div className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                    <div className="text-xs text-muted-foreground">Text written</div>
                    <div className="text-sm font-semibold text-foreground tabular-nums">
                      {formatNumber(sessionMetrics.textWritten)} <span className="text-xs font-normal text-muted-foreground">chars</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
