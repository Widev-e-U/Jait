import { ActionCard, useConsentQueue } from './action-card';
import { ShieldAlert, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
function StatusBadge({ status }) {
    const config = {
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
    };
    const { icon: Icon, label, color } = config[status];
    return (<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${color}`}>
      <Icon className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`}/>
      {label}
    </span>);
}
export function ConsentQueue({ className = '', compact = false, sessionId, onApproveAllEnabled }) {
    const { queue, approve, reject, approveAllForSession } = useConsentQueue(sessionId);
    const [approvingAll, setApprovingAll] = useState(false);
    const visibleQueue = useMemo(() => (sessionId ? queue.filter((r) => r.sessionId === sessionId) : queue), [queue, sessionId]);
    const handleApproveAllInSession = async () => {
        if (!sessionId || approvingAll)
            return;
        setApprovingAll(true);
        const ok = await approveAllForSession(sessionId);
        if (ok)
            onApproveAllEnabled?.();
        setApprovingAll(false);
    };
    if (visibleQueue.length === 0) {
        return null;
    }
    return (<div className={`space-y-2 ${className}`}>
      {/* Queue header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <StatusBadge status="awaiting-approval"/>
          <span className="text-xs text-muted-foreground">
            {visibleQueue.length} pending {visibleQueue.length === 1 ? 'request' : 'requests'}
          </span>
        </div>
        {sessionId && visibleQueue.length > 0 && (<button onClick={handleApproveAllInSession} disabled={approvingAll} className="text-[11px] text-green-600 hover:text-green-500 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed">
            {approvingAll ? 'Approving...' : 'Approve all in this session'}
          </button>)}
      </div>

      {/* Consent requests */}
      <div className="space-y-2">
        {visibleQueue.map((request) => (<ActionCard key={request.id} request={request} onApprove={approve} onReject={reject} compact={compact}/>))}
      </div>
    </div>);
}
//# sourceMappingURL=consent-queue.js.map