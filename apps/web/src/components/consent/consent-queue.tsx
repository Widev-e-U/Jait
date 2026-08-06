import { ActionCard, ToolIcon, useConsentQueue, type ConsentRequestInfo } from './action-card'
import { ShieldAlert, ShieldCheck, ShieldX, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'

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
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
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
  /** If provided, only show consent requests for this session */
  sessionId?: string | null
  /** Called when approve-all mode is successfully enabled */
  onApproveAllEnabled?: () => void
  /** If true, render as a block inside a shared merged composer surface */
  merged?: boolean
}

export function ConsentQueue({ className = '', compact = false, sessionId, onApproveAllEnabled, merged }: ConsentQueueProps) {
  const { queue, approve, reject, approveAllForSession } = useConsentQueue(sessionId)
  const [approvingAll, setApprovingAll] = useState(false)

  const visibleQueue = useMemo(
    () => (sessionId ? queue.filter((r) => r.sessionId === sessionId) : queue),
    [queue, sessionId],
  )

  const handleApproveAllInSession = async () => {
    if (!sessionId || approvingAll) return
    setApprovingAll(true)
    const ok = await approveAllForSession(sessionId)
    if (ok) onApproveAllEnabled?.()
    setApprovingAll(false)
  }

  if (visibleQueue.length === 0) {
    return null
  }

  // Single-row layout for the merged composer surface above the chat.
  if (merged) {
    const first = visibleQueue[0]
    const extra = visibleQueue.length - 1
    return (
      <div className={`flex items-center gap-2 px-3.5 py-2 border-t bg-background dark:bg-card ${className}`}>
        <ToolIcon toolName={first.toolName} />
        <span className="text-xs font-semibold text-foreground truncate shrink-0">{first.toolName}</span>
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{first.summary}</span>
        {extra > 0 && (
          <span
            title={`${extra} more pending ${extra === 1 ? 'request' : 'requests'}`}
            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground shrink-0"
          >
            +{extra}
          </span>
        )}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            title="Reject this request"
            onClick={() => reject(first.id)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
          >
            <ShieldX className="h-3.5 w-3.5" />
            Reject
          </button>
          <button
            type="button"
            title="Approve this request"
            onClick={() => approve(first.id)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-green-600 text-white hover:bg-green-500 transition-colors"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Approve
          </button>
          {sessionId && (
            <button
              type="button"
              title="Approve all pending requests"
              onClick={handleApproveAllInSession}
              disabled={approvingAll}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {approvingAll ? 'Approving...' : 'Approve all'}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Queue header */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge status="awaiting-approval" />
          <span className="text-xs font-medium text-foreground truncate">
            {visibleQueue.length} pending {visibleQueue.length === 1 ? 'request' : 'requests'}
          </span>
        </div>
        {sessionId && visibleQueue.length > 0 && (
          <button
            onClick={handleApproveAllInSession}
            disabled={approvingAll}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {approvingAll ? 'Approving...' : 'Approve all'}
          </button>
        )}
      </div>

      {/* Consent requests */}
      <div className="space-y-2">
        {visibleQueue.map((request: ConsentRequestInfo) => (
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
