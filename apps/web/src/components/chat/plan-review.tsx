import { useState } from 'react'
import {
  X,
  Play,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface PlanAction {
  id: string
  tool: string
  args: unknown
  description: string
  order: number
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'
  result?: { ok: boolean; message: string; data?: unknown }
}

export interface PlanData {
  plan_id: string
  summary: string
  actions: PlanAction[]
}

interface PlanReviewProps {
  plan: PlanData
  onApprove: (actionIds?: string[]) => void
  onReject: () => void
  isExecuting?: boolean
  className?: string
}

const STATUS_CONFIG: Record<
  PlanAction['status'],
  { icon: React.ComponentType<{ className?: string }>; label: string; color: string }
> = {
  pending: { icon: Clock, label: 'Pending', color: 'text-muted-foreground' },
  approved: { icon: Loader2, label: 'Running', color: 'text-blue-500' },
  rejected: { icon: X, label: 'Rejected', color: 'text-destructive' },
  executed: { icon: CheckCircle2, label: 'Done', color: 'text-green-500' },
  failed: { icon: AlertCircle, label: 'Failed', color: 'text-destructive' },
}

function ActionItem({ action, expanded, onToggle }: {
  action: PlanAction
  expanded: boolean
  onToggle: () => void
}) {
  const config = STATUS_CONFIG[action.status]
  const StatusIcon = config.icon

  return (
    <div className="border rounded-md">
      <button
        type="button"
        className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <StatusIcon
          className={cn('h-4 w-4 shrink-0', config.color, action.status === 'approved' && 'animate-spin')}
        />
        <span className="flex-1 min-w-0">
          <span className="font-mono text-sm font-medium">{action.tool}</span>
          <span className="text-xs text-muted-foreground ml-2">Step {action.order + 1}</span>
        </span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {config.label}
        </Badge>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t bg-muted/30">
          <p className="text-sm text-muted-foreground mb-2">{action.description}</p>
          <pre className="text-xs bg-background rounded p-2 overflow-x-auto max-h-48">
            {JSON.stringify(action.args, null, 2)}
          </pre>
          {action.result && (
            <div className={cn(
              'mt-2 text-xs rounded p-2',
              action.result.ok ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive',
            )}>
              {action.result.message}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function PlanReview({ plan, onApprove, onReject, isExecuting, className }: PlanReviewProps) {
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set())

  const toggleAction = (id: string) => {
    setExpandedActions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const pendingCount = plan.actions.filter((a) => a.status === 'pending').length
  const executedCount = plan.actions.filter((a) => a.status === 'executed').length
  const failedCount = plan.actions.filter((a) => a.status === 'failed').length
  const isComplete = pendingCount === 0

  return (
    <Card className={cn('p-4 space-y-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Plan
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {plan.actions.length} step{plan.actions.length !== 1 ? 's' : ''}
            </Badge>
          </h3>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{plan.summary}</p>
        </div>
        {isComplete && (
          <Badge variant={failedCount > 0 ? 'destructive' : 'success'} className="shrink-0">
            {failedCount > 0 ? `${failedCount} failed` : 'Complete'}
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        {plan.actions.map((action) => (
          <ActionItem
            key={action.id}
            action={action}
            expanded={expandedActions.has(action.id)}
            onToggle={() => toggleAction(action.id)}
          />
        ))}
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={() => onApprove()}
            disabled={isExecuting}
          >
            {isExecuting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Executing...
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Execute all ({pendingCount})
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onReject}
            disabled={isExecuting}
          >
            <X className="h-3.5 w-3.5 mr-1.5" />
            Reject
          </Button>
        </div>
      )}

      {isComplete && !isExecuting && (
        <p className="text-xs text-muted-foreground">
          {executedCount > 0 && `${executedCount} action${executedCount !== 1 ? 's' : ''} executed.`}
          {failedCount > 0 && ` ${failedCount} failed.`}
        </p>
      )}
    </Card>
  )
}

function ClipboardList({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </svg>
  )
}
