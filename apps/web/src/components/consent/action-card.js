import { useState, useEffect, useCallback } from 'react';
import { Shield, ShieldAlert, ShieldCheck, ShieldX, Clock, Terminal, FileText, Info } from 'lucide-react';
import { getApiUrl, getWsUrl } from '@/lib/gateway-url';
const GATEWAY = getApiUrl();
const WS_URL = getWsUrl();
// ── useConsentQueue hook ─────────────────────────────────────────────
export function useConsentQueue(sessionId) {
    const [queue, setQueue] = useState([]);
    // Fetch pending consent requests
    const refresh = useCallback(async () => {
        try {
            const url = sessionId
                ? `${GATEWAY}/api/consent/pending/${sessionId}`
                : `${GATEWAY}/api/consent/pending`;
            const res = await fetch(url);
            const data = (await res.json());
            setQueue(data.requests);
        }
        catch {
            // gateway down
        }
    }, [sessionId]);
    // Listen for WS events
    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'consent.required') {
                    const request = msg.payload;
                    if (!sessionId || request.sessionId === sessionId) {
                        setQueue((prev) => [...prev, request]);
                    }
                }
                if (msg.type === 'consent.resolved') {
                    const decision = msg.payload;
                    setQueue((prev) => prev.filter((r) => r.id !== decision.requestId));
                }
            }
            catch {
                // ignore parse errors
            }
        };
        ws.onopen = () => refresh();
        return () => ws.close();
    }, [refresh, sessionId]);
    const approve = useCallback(async (requestId) => {
        try {
            await fetch(`${GATEWAY}/api/consent/${requestId}/approve`, { method: 'POST' });
            setQueue((prev) => prev.filter((r) => r.id !== requestId));
        }
        catch {
            // retry or show error
        }
    }, []);
    const reject = useCallback(async (requestId, reason) => {
        try {
            await fetch(`${GATEWAY}/api/consent/${requestId}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason }),
            });
            setQueue((prev) => prev.filter((r) => r.id !== requestId));
        }
        catch {
            // retry or show error
        }
    }, []);
    const approveAllForSession = useCallback(async (targetSessionId, reason) => {
        try {
            const res = await fetch(`${GATEWAY}/api/consent/pending/${targetSessionId}/approve-all`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason }),
            });
            const data = (await res.json());
            const approvedIds = new Set(data.requestIds ?? []);
            if (approvedIds.size > 0) {
                setQueue((prev) => prev.filter((r) => !approvedIds.has(r.id)));
            }
            else {
                setQueue((prev) => prev.filter((r) => r.sessionId !== targetSessionId));
            }
            return true;
        }
        catch {
            // retry or show error
            return false;
        }
    }, []);
    return { queue, approve, reject, approveAllForSession, refresh };
}
// ── RiskBadge ────────────────────────────────────────────────────────
function RiskBadge({ risk }) {
    const colors = {
        low: 'bg-green-500/10 text-green-600 dark:text-green-400',
        medium: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
        high: 'bg-red-500/10 text-red-600 dark:text-red-400',
    };
    const icons = {
        low: Shield,
        medium: ShieldAlert,
        high: ShieldX,
    };
    const Icon = icons[risk];
    return (<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${colors[risk]}`}>
      <Icon className="h-3 w-3"/>
      {risk}
    </span>);
}
// ── TimeRemaining ────────────────────────────────────────────────────
function TimeRemaining({ expiresAt }) {
    const [remaining, setRemaining] = useState('');
    useEffect(() => {
        const update = () => {
            const diff = new Date(expiresAt).getTime() - Date.now();
            if (diff <= 0) {
                setRemaining('expired');
                return;
            }
            const secs = Math.ceil(diff / 1000);
            if (secs > 60) {
                setRemaining(`${Math.ceil(secs / 60)}m`);
            }
            else {
                setRemaining(`${secs}s`);
            }
        };
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [expiresAt]);
    return (<span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <Clock className="h-3 w-3"/>
      {remaining}
    </span>);
}
// ── ToolIcon ─────────────────────────────────────────────────────────
function ToolIcon({ toolName }) {
    if (toolName.startsWith('terminal.'))
        return <Terminal className="h-4 w-4"/>;
    if (toolName.startsWith('file.'))
        return <FileText className="h-4 w-4"/>;
    return <Info className="h-4 w-4"/>;
}
// ── PreviewBlock ─────────────────────────────────────────────────────
function PreviewBlock({ preview, toolName }) {
    const command = preview.command;
    const filePath = preview.path;
    const content = preview.content;
    if (command) {
        return (<div className="rounded-md bg-muted p-3 font-mono text-xs leading-relaxed overflow-x-auto">
        <span className="text-muted-foreground">$ </span>
        {command}
      </div>);
    }
    if (filePath) {
        return (<div className="rounded-md bg-muted p-3 text-xs leading-relaxed overflow-x-auto">
        <div className="text-muted-foreground mb-1">{toolName}: {filePath}</div>
        {content && (<pre className="font-mono whitespace-pre-wrap">{content.length > 500 ? content.slice(0, 500) + '...' : content}</pre>)}
      </div>);
    }
    // Generic preview
    return (<div className="rounded-md bg-muted p-3 font-mono text-xs leading-relaxed overflow-x-auto">
      {JSON.stringify(preview, null, 2)}
    </div>);
}
export function ActionCard({ request, onApprove, onReject, compact = false }) {
    const [deciding, setDeciding] = useState(false);
    const handleApprove = async () => {
        setDeciding(true);
        onApprove(request.id);
    };
    const handleReject = async () => {
        setDeciding(true);
        onReject(request.id);
    };
    if (compact) {
        return (<div className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-card">
        <ToolIcon toolName={request.toolName}/>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium truncate">{request.toolName}</span>
            <RiskBadge risk={request.risk}/>
            <TimeRemaining expiresAt={request.expiresAt}/>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{request.summary}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={handleApprove} disabled={deciding} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 disabled:opacity-50 transition-colors">
            <ShieldCheck className="h-3 w-3"/>
            Approve
          </button>
          <button onClick={handleReject} disabled={deciding} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors">
            <ShieldX className="h-3 w-3"/>
            Reject
          </button>
        </div>
      </div>);
    }
    return (<div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <ToolIcon toolName={request.toolName}/>
          <span className="text-sm font-medium">{request.toolName}</span>
          <RiskBadge risk={request.risk}/>
        </div>
        <TimeRemaining expiresAt={request.expiresAt}/>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        <p className="text-sm text-foreground">{request.summary}</p>
        <PreviewBlock preview={request.preview} toolName={request.toolName}/>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-muted/20">
        <button onClick={handleReject} disabled={deciding} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors">
          <ShieldX className="h-3.5 w-3.5"/>
          Reject
        </button>
        <button onClick={handleApprove} disabled={deciding} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 disabled:opacity-50 transition-colors">
          <ShieldCheck className="h-3.5 w-3.5"/>
          Approve
        </button>
      </div>
    </div>);
}
//# sourceMappingURL=action-card.js.map