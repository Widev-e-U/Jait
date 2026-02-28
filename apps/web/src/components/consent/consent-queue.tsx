import { ActionCard, useConsentQueue, type ConsentRequestInfo } from './action-card'
import { ShieldAlert, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'

// ── StatusBadge ──────────────────────────────────────────────────────

type QueueItemStatus = 'running' | 'awaiting-approval' | 'needs-input' | 'completed' | 'failed'

function StatusBadge({ status }: { status: QueueItemStatus }) {
  const config: Record<QueueItemStatus, { icon: typeof Clock; label: string; color: string }> = {
    'running': {
      icon: Loader2,
      label: 'Running',
      color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
    'awaiting-approval': {
      icon: ShieldAlert,
      label: 'Awaiting Approval',
      color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    },
    'needs-input': {
      icon: Clock,
      label: 'Needs Input',
      color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    },
    'completed': {
      icon: CheckCircle2,
      label: 'Completed',
      color: 'bg-green-500/10 text-green-600 dark:text-green-400',
    },
    'failed': {
      icon: XCircle,
      label: 'Failed',
      color: 'bg-red-500/10 text-red-600 dark:text-red-400',
    },
  }

  const { icon: Icon, label, color } = config[status]

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${color}`}>
      <Icon className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {label}
    </span>
  )
}

// ── ConsentQueue ─────────────────────────────────────────────────────

export interface ConsentQueueProps {
  className?: string
  /** If true, shows compact action cards instead of full cards */
  compact?: boolean
}

export function ConsentQueue({ className = '', compact = false }: ConsentQueueProps) {
  const { queue, approve, reject } = useConsentQueue()

  if (queue.length === 0) {
    return null
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Queue header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <StatusBadge status="awaiting-approval" />
          <span className="text-xs text-muted-foreground">
            {queue.length} pending {queue.length === 1 ? 'request' : 'requests'}
          </span>
        </div>
      </div>

      {/* Consent requests */}
      <div className="space-y-2">
        {queue.map((request: ConsentRequestInfo) => (
          <ActionCard
            key={request.id}
            request={request}
            onApprove={approve}
            onReject={reject}
            compact={compact}
          />
        ))}
      </div>
    </div>
  )
}
