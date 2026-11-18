import { OctagonX, Play, Loader2, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AgentControlState } from '@/lib/agent-control-api'

export interface AgentHaltBannerProps {
  state: AgentControlState
  /** A halt/resume request is in flight; both buttons are locked. */
  pending?: boolean
  error?: string | null
  onResume: () => void
  className?: string
}

function formatHaltedAt(haltedAt: string | null): string | null {
  if (!haltedAt) return null
  const date = new Date(haltedAt)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Owner-wide "agents are stopped" banner.
 *
 * Rendered from server state, not a local flag, so it survives reloads and
 * matches every other device. While it is shown the UI must not look like work
 * is merely idle: the copy names the halt and gives the single way out, resume.
 */
export function AgentHaltBanner({ state, pending, error, onResume, className }: AgentHaltBannerProps) {
  if (!state.halted) return null
  const haltedAt = formatHaltedAt(state.haltedAt)

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200',
        className,
      )}
    >
      <OctagonX className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="font-medium">Autonomous work is halted.</span>
      <span className="text-amber-800/90 dark:text-amber-200/80">
        New threads and team deliveries are held; scheduled agent runs cannot start.
        {state.reason ? <span className="italic"> Reason: {state.reason}</span> : null}
        {haltedAt ? <span className="whitespace-nowrap"> Stopped {haltedAt}.</span> : null}
      </span>
      {error ? <span className="text-red-600 dark:text-red-400">{error}</span> : null}
      <Button
        size="sm"
        variant="outline"
        className="ml-auto h-7 gap-1 border-amber-600/50 bg-transparent text-amber-900 hover:bg-amber-500/20 dark:text-amber-100"
        disabled={pending}
        onClick={onResume}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
        Resume agents
      </Button>
    </div>
  )
}

export interface AgentStopAllButtonProps {
  /** Number of agents currently running; the button hides at zero. */
  runningCount: number
  pending?: boolean
  error?: string | null
  onStopAll: () => void
  className?: string
}

/**
 * Hard stop for every agent the owner is running.
 *
 * Deliberately plain and always present while work is running: when the user
 * wants everything to stop, hunting through menus is the wrong experience. It
 * disappears once halted because the banner then owns the state.
 */
export function AgentStopAllButton({ runningCount, pending, error, onStopAll, className }: AgentStopAllButtonProps) {
  if (runningCount <= 0) return null

  return (
    <div
      className={cn(
        'flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground',
        className,
      )}
    >
      <span>
        {runningCount} agent{runningCount === 1 ? '' : 's'} running
      </span>
      {error ? <span className="text-red-600 dark:text-red-400">{error}</span> : null}
      <Button
        size="sm"
        variant="outline"
        className="ml-auto h-7 gap-1"
        disabled={pending}
        onClick={onStopAll}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Square className="h-3.5 w-3.5" aria-hidden="true" />}
        Stop all agents
      </Button>
    </div>
  )
}
