import { useState, useEffect, useCallback, useRef } from 'react'
import { Shield, ShieldAlert, ShieldCheck, ShieldX, Clock, Terminal, FileText, Info } from 'lucide-react'
import { getApiUrl, getWsUrl } from '@/lib/gateway-url'
import { getAuthToken } from '@/lib/auth-token'

const GATEWAY = getApiUrl()
const WS_URL = getWsUrl()

// ── Types ────────────────────────────────────────────────────────────

export interface ConsentRequestInfo {
  id: string
  actionId: string
  toolName: string
  summary: string
  preview: Record<string, unknown>
  risk: 'low' | 'medium' | 'high'
  policy: {
    consentLevel: 'none' | 'once' | 'always' | 'dangerous'
    description: string
    knownTool: boolean
    source: 'profile' | 'unknown-tool'
  }
  sessionId: string
  createdAt: string
  expiresAt: string
  status: 'pending' | 'approved' | 'rejected' | 'timeout'
}

export interface ConsentPolicyInfo {
  activeProfileName: string | null
  toolCount: number
  permissions: Array<{
    toolName: string
    consentLevel: 'none' | 'once' | 'always' | 'dangerous'
    risk: 'low' | 'medium' | 'high'
    description: string
  }>
  unknownToolsRequireConsent: boolean
}

export interface ConsentDecisionInfo {
  requestId: string
  actionId: string
  approved: boolean
  decidedAt: string
  decidedVia: string
  reason?: string
}

// ── useConsentQueue hook ─────────────────────────────────────────────

export function useConsentQueue(sessionId?: string | null) {
  const [queue, setQueue] = useState<ConsentRequestInfo[]>([])
  const refreshRef = useRef<() => Promise<void>>(async () => {})
  const sessionIdRef = useRef<string | null | undefined>(sessionId)
  sessionIdRef.current = sessionId

  // Fetch pending consent requests
  const refresh = useCallback(async () => {
    try {
      const url = sessionId
        ? `${GATEWAY}/api/consent/pending/${sessionId}`
        : `${GATEWAY}/api/consent/pending`
      const res = await fetch(url)
      const data = (await res.json()) as { requests: ConsentRequestInfo[] }
      setQueue(data.requests)
    } catch {
      // gateway down
    }
  }, [sessionId])
  refreshRef.current = refresh

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Listen for WS events (authenticated so consent.required reaches the UI in real time)
  useEffect(() => {
    let disposed = false
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const handleMessage = (event: MessageEvent) => {
      if (disposed) return
      try {
        const msg = JSON.parse(event.data) as { type: string; payload: unknown }

        if (msg.type === 'consent.required') {
          const request = msg.payload as ConsentRequestInfo
          const currentSessionId = sessionIdRef.current
          if (!currentSessionId || request.sessionId === currentSessionId) {
            setQueue((prev) => [...prev, request])
          }
        }

        if (msg.type === 'consent.resolved') {
          const decision = msg.payload as ConsentDecisionInfo
          setQueue((prev) => prev.filter((r) => r.id !== decision.requestId))
        }
      } catch {
        // ignore parse errors
      }
    }

    const connect = () => {
      if (disposed) return
      const token = getAuthToken()
      const socket = new WebSocket(token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL)
      ws = socket

      socket.onmessage = handleMessage

      socket.onopen = () => {
        if (disposed) return
        void refreshRef.current()
      }

      socket.onclose = () => {
        ws = null
        if (disposed) return
        reconnectTimer = setTimeout(connect, 1000)
      }

      socket.onerror = () => {
        // onclose will fire after onerror and trigger reconnect
      }
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws) {
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        try {
          ws.close()
        } catch {
          // ignore close races during React dev remounts
        }
      }
    }
  }, [])

  const approve = useCallback(async (requestId: string) => {
    try {
      await fetch(`${GATEWAY}/api/consent/${requestId}/approve`, { method: 'POST' })
      setQueue((prev) => prev.filter((r) => r.id !== requestId))
    } catch {
      // retry or show error
    }
  }, [])

  const reject = useCallback(async (requestId: string, reason?: string) => {
    try {
      await fetch(`${GATEWAY}/api/consent/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      setQueue((prev) => prev.filter((r) => r.id !== requestId))
    } catch {
      // retry or show error
    }
  }, [])

  const approveAllForSession = useCallback(async (targetSessionId: string, reason?: string) => {
    try {
      const res = await fetch(`${GATEWAY}/api/consent/pending/${targetSessionId}/approve-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const data = (await res.json()) as { requestIds?: string[] }
      const approvedIds = new Set(data.requestIds ?? [])
      if (approvedIds.size > 0) {
        setQueue((prev) => prev.filter((r) => !approvedIds.has(r.id)))
      } else {
        setQueue((prev) => prev.filter((r) => r.sessionId !== targetSessionId))
      }
      return true
    } catch {
      // retry or show error
      return false
    }
  }, [])

  return { queue, approve, reject, approveAllForSession, refresh }
}

export function useConsentPolicy() {
  const [policy, setPolicy] = useState<ConsentPolicyInfo | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${GATEWAY}/api/consent/policy`)
      const data = (await res.json()) as ConsentPolicyInfo
      setPolicy(data)
    } catch {
      setPolicy(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { policy, refresh }
}

// ── RiskBadge ────────────────────────────────────────────────────────

function RiskBadge({ risk }: { risk: 'low' | 'medium' | 'high' }) {
  const colors = {
    low: 'bg-green-500/10 text-green-600 dark:text-green-400',
    medium: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    high: 'bg-red-500/10 text-red-600 dark:text-red-400',
  }
  const icons = {
    low: Shield,
    medium: ShieldAlert,
    high: ShieldX,
  }
  const Icon = icons[risk]

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[risk]}`}>
      <Icon className="h-3 w-3" />
      {risk}
    </span>
  )
}

function ConsentLevelBadge({ level }: { level: ConsentRequestInfo['policy']['consentLevel'] }) {
  const config = {
    none: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    once: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    always: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    dangerous: 'bg-red-500/10 text-red-600 dark:text-red-400',
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config[level]}`}>
      {level}
    </span>
  )
}

// ── TimeRemaining ────────────────────────────────────────────────────

function TimeRemaining({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now()
      if (diff <= 0) {
        setRemaining('expired')
        return
      }
      const secs = Math.ceil(diff / 1000)
      if (secs > 60) {
        setRemaining(`${Math.ceil(secs / 60)}m`)
      } else {
        setRemaining(`${secs}s`)
      }
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      {remaining}
    </span>
  )
}

// ── ToolIcon ─────────────────────────────────────────────────────────

function ToolIcon({ toolName }: { toolName: string }) {
  let icon = <Info className="h-3.5 w-3.5" />
  if (toolName.startsWith('terminal.')) icon = <Terminal className="h-3.5 w-3.5" />
  else if (toolName.startsWith('file.')) icon = <FileText className="h-3.5 w-3.5" />

  return (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-muted text-muted-foreground shrink-0 mt-0.5">
      {icon}
    </span>
  )
}

// ── PreviewBlock ─────────────────────────────────────────────────────

function PreviewBlock({ preview, toolName }: { preview: Record<string, unknown>; toolName: string }) {
  const command = preview.command as string | undefined
  const filePath = preview.path as string | undefined
  const content = preview.content as string | undefined

  if (command) {
    return (
      <div className="rounded-md bg-muted p-3 font-mono text-xs leading-relaxed overflow-x-auto">
        <span className="text-muted-foreground">$ </span>
        {command}
      </div>
    )
  }

  if (filePath) {
    return (
      <div className="rounded-md bg-muted p-3 text-xs leading-relaxed overflow-x-auto">
        <div className="text-muted-foreground mb-1">{toolName}: {filePath}</div>
        {content && (
          <pre className="font-mono whitespace-pre-wrap">{
            content.length > 500 ? content.slice(0, 500) + '...' : content
          }</pre>
        )}
      </div>
    )
  }

  // Generic preview
  return (
    <div className="rounded-md bg-muted p-3 font-mono text-xs leading-relaxed overflow-x-auto">
      {JSON.stringify(preview, null, 2)}
    </div>
  )
}

// ── ActionCard ───────────────────────────────────────────────────────

export interface ActionCardProps {
  request: ConsentRequestInfo
  onApprove: (requestId: string) => void
  onReject: (requestId: string, reason?: string) => void
  compact?: boolean
}

export function ActionCard({ request, onApprove, onReject, compact = false }: ActionCardProps) {
  const [deciding, setDeciding] = useState(false)

  const handleApprove = async () => {
    setDeciding(true)
    onApprove(request.id)
  }

  const handleReject = async () => {
    setDeciding(true)
    onReject(request.id)
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-start gap-3 px-3 py-2.5 rounded-lg border bg-card">
        <ToolIcon toolName={request.toolName} />
        <div className="flex-1 min-w-0 basis-0">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-xs font-semibold truncate text-foreground">{request.toolName}</span>
            <RiskBadge risk={request.risk} />
            <ConsentLevelBadge level={request.policy.consentLevel} />
          </div>
          <p className="text-xs text-muted-foreground truncate mt-1 leading-relaxed">{request.summary}</p>
        </div>
        <div className="flex flex-col items-start gap-1.5 shrink-0 sm:items-end sm:pl-2">
          <TimeRemaining expiresAt={request.expiresAt} />
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleApprove}
              disabled={deciding}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Approve
            </button>
            <button
              onClick={handleReject}
              disabled={deciding}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ShieldX className="h-3.5 w-3.5" />
              Reject
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <ToolIcon toolName={request.toolName} />
          <span className="text-sm font-medium">{request.toolName}</span>
          <RiskBadge risk={request.risk} />
          <ConsentLevelBadge level={request.policy.consentLevel} />
        </div>
        <TimeRemaining expiresAt={request.expiresAt} />
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        <p className="text-sm text-foreground">{request.summary}</p>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{request.policy.description}</p>
          {!request.policy.knownTool && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Unknown tool: blocked behind dangerous consent until added to the active profile.
            </p>
          )}
        </div>
        <PreviewBlock preview={request.preview} toolName={request.toolName} />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-muted/20">
        <button
          onClick={handleReject}
          disabled={deciding}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
        >
          <ShieldX className="h-3.5 w-3.5" />
          Reject
        </button>
        <button
          onClick={handleApprove}
          disabled={deciding}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Approve
        </button>
      </div>
    </div>
  )
}
