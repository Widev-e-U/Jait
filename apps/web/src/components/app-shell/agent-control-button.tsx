import { Loader2, Play, Square, Users } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { TeamAvatar } from '@/components/manager/team-avatar'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { AgentControlState } from '@/lib/agent-control-api'
import { PERSONA_AVATARS } from '@/lib/persona-agents'
import { cn } from '@/lib/utils'
import './agent-control-button.css'

export interface AgentControlButtonProps {
  state: AgentControlState
  runningCount: number
  avatars?: string[]
  pending?: boolean
  error?: string | null
  collapsed?: boolean
  placement?: 'sidebar' | 'header'
  onOpenAgents: () => void
  onStopAll: () => void
  onResume: () => void
}

/** One owner-wide control shared by the sidebar and compact mobile header. */
export function AgentControlButton({ state, runningCount, avatars = [], pending, error, collapsed, placement = 'sidebar', onOpenAgents, onStopAll, onResume }: AgentControlButtonProps) {
  const action = state.halted ? 'Resume agents' : 'Stop all agents'
  const status = state.halted ? 'Agents halted' : runningCount > 0 ? `${runningCount} running` : 'Agents ready'
  const header = placement === 'header'
  const compactSidebar = collapsed && !header
  const faces = (avatars.length ? avatars : PERSONA_AVATARS).slice(0, 3)
  const members = faces.map((avatar, index) => ({ id: `agent-${index}`, name: avatar, avatar }))
  return (
    <div className={cn('min-w-0 shrink-0', collapsed && (header ? 'w-14 min-[360px]:w-16' : 'w-10'), !header && (compactSidebar ? 'mb-3' : 'mb-2'))}>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                aria-label="Agent controls"
                aria-busy={pending || undefined}
                data-agent-control={state.halted ? 'halted' : 'ready'}
                className={cn('w-full gap-2 rounded-lg px-2', compactSidebar ? 'h-auto min-h-20 justify-center px-0 py-2' : collapsed ? 'h-10 justify-center px-0' : 'h-11 justify-start', state.halted && 'bg-amber-500/5 text-amber-700 dark:text-amber-300')}
              >
                <span className={cn('inline-flex shrink-0 items-center gap-0.5', compactSidebar && 'justify-center')} aria-hidden="true">
                  <TeamAvatar members={members} layout="stack" size={header ? 24 : 32} className={cn('agent-control-avatars', compactSidebar && 'agent-control-avatars-vertical')} />
                  {/* No resting status dot: halted/ready is already carried by the button tint, the tooltip and the live sr-only status. Only an in-flight action shows a spinner. */}
                  {pending && <span className="flex h-2 w-1.5 shrink-0 items-center justify-center">
                    <Loader2 className="h-1.5 w-1.5 animate-spin" />
                  </span>}
                </span>
                {!collapsed && <span className="min-w-0 text-left leading-tight"><span className="block truncate text-xs font-medium">Agent controls</span><span className="block text-2xs font-normal text-muted-foreground">{status}</span></span>}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side={header ? 'bottom' : 'right'} className="pointer-events-none max-w-64">
            <p>{action} · {status}</p>
            {state.halted && <p className="mt-1 text-xs">New threads, team deliveries and scheduled runs are held.{state.reason ? ` ${state.reason}` : ''}</p>}
            {error && <p className="mt-1 text-xs">{error}</p>}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent className="z-[70]" side={header ? 'bottom' : 'top'} align={header ? 'end' : 'start'} collisionPadding={8}>
          <DropdownMenuLabel>{status}</DropdownMenuLabel>
          {state.halted && <p className="max-w-64 px-2 py-1 text-xs text-muted-foreground">New threads, team deliveries and scheduled runs are held.{state.reason ? ` ${state.reason}` : ''}</p>}
          <DropdownMenuItem onSelect={onOpenAgents}>
            <Users className="mr-2 h-4 w-4" />Go to Agents
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={pending} onSelect={state.halted ? onResume : onStopAll} className={state.halted ? undefined : 'text-red-600 focus:text-red-600 dark:text-red-400'}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : state.halted ? <Play className="mr-2 h-4 w-4" /> : <Square className="mr-2 h-4 w-4" />}
            {action}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="sr-only" role="status" aria-live="polite">{status}</span>
      {error && <p role="alert" className={cn('text-xs text-red-600 dark:text-red-400', collapsed ? 'sr-only' : 'px-2 py-1')}>{error}</p>}
    </div>
  )
}
