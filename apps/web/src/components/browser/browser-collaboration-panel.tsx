import { useMemo, useState } from 'react'
import { ExternalLink, Eye, Hand, Monitor, Play, Shield, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { BrowserIntervention, BrowserSession } from '@/lib/browser-collaboration-api'
import { canOpenLiveSessionInPreview, getBrowserSessionDetails, getBrowserSessionOpenTarget } from './browser-collaboration-panel-helpers'

interface BrowserCollaborationPanelProps {
  sessions: BrowserSession[]
  interventions: BrowserIntervention[]
  loading?: boolean
  onRefresh: () => void
  onOpenLiveSession: (target: string | null, workspaceRoot?: string | null) => void
  onTakeControl: (browserSessionId: string) => Promise<void>
  onReturnControl: (browserSessionId: string) => Promise<void>
  onResume: (browserSessionId: string) => Promise<void>
  onResolveIntervention: (interventionId: string, userNote?: string) => Promise<void>
}

function statusTone(status: BrowserSession['status']) {
  switch (status) {
    case 'intervention-required': return 'destructive'
    case 'paused': return 'secondary'
    case 'running': return 'default'
    case 'closed': return 'outline'
    default: return 'outline'
  }
}

export function BrowserCollaborationPanel(props: BrowserCollaborationPanelProps) {
  const { sessions, interventions, loading, onRefresh, onOpenLiveSession, onTakeControl, onReturnControl, onResume, onResolveIntervention } = props
  const [noteByIntervention, setNoteByIntervention] = useState<Record<string, string>>({})
  const openInterventions = useMemo(() => interventions.filter((item) => item.status === 'open'), [interventions])
  const sessionsById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions])

  const renderOpenAction = (session: BrowserSession) => {
    const liveTarget = getBrowserSessionOpenTarget(session)
    if (!liveTarget) return null
    if (canOpenLiveSessionInPreview(session)) {
      return (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => onOpenLiveSession(liveTarget, session.workspaceRoot)}
        >
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          Open live session
        </Button>
      )
    }
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        onClick={() => window.open(liveTarget, '_blank', 'noopener,noreferrer')}
      >
        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
        Open raw URL
      </Button>
    )
  }

  if (!loading && sessions.length === 0 && openInterventions.length === 0) return null

  return (
    <div className="fixed left-4 bottom-4 z-50 w-[440px] max-w-[calc(100vw-2rem)] rounded-2xl border bg-background/95 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Monitor className="h-4 w-4" />
            Browser Collaboration
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Live sessions, handoff, and intervention requests.
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onRefresh} disabled={loading}>
          {loading ? 'Syncing' : 'Refresh'}
        </Button>
      </div>

      <div className="max-h-[65vh] space-y-3 overflow-auto p-3">
        {openInterventions.map((item) => {
          const session = sessionsById.get(item.browserSessionId)
          const liveTarget = session ? getBrowserSessionOpenTarget(session) : null
          return (
            <div key={item.id} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{item.reason}</div>
                <div className="mt-1 text-xs text-muted-foreground">{item.instructions}</div>
                {session && (
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <div>
                      Session: <span className="font-medium text-foreground">{session.name}</span>
                    </div>
                    <div className="break-all font-mono">
                      {liveTarget ?? session.workspaceRoot ?? 'No live target available'}
                    </div>
                  </div>
                )}
              </div>
              <Badge variant={item.secretSafe ? 'destructive' : 'secondary'}>
                {item.secretSafe ? 'Secret-safe' : 'Action needed'}
              </Badge>
            </div>
            {item.allowUserNote && (
              <textarea
                className="mt-3 min-h-[64px] w-full rounded-md border bg-background px-3 py-2 text-xs outline-none"
                placeholder="Optional note for the agent before resume"
                value={noteByIntervention[item.id] ?? ''}
                onChange={(event) => setNoteByIntervention((prev) => ({ ...prev, [item.id]: event.target.value }))}
              />
            )}
            <div className="mt-3 flex gap-2">
              {session && liveTarget ? renderOpenAction(session) : null}
              {session && session.controller !== 'user' && (
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onTakeControl(session.id)}>
                  <Hand className="mr-1.5 h-3.5 w-3.5" />
                  Take control
                </Button>
              )}
              <Button size="sm" className="h-8 text-xs" onClick={() => onResolveIntervention(item.id, noteByIntervention[item.id])}>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Continue
              </Button>
            </div>
            </div>
          )
        })}

        {sessions.map((session) => (
          <div key={session.id} className="rounded-xl border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{session.name}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{session.mode === 'isolated' ? 'isolated browser' : 'shared browser'}</Badge>
                  <Badge variant="outline">{session.origin}</Badge>
                  <Badge variant={statusTone(session.status)}>{session.status}</Badge>
                  <Badge variant={session.controller === 'user' ? 'secondary' : session.controller === 'observer' ? 'outline' : 'default'}>
                    {session.controller === 'user' ? (
                      <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" /> user</span>
                    ) : session.controller === 'observer' ? (
                      <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> observer</span>
                    ) : (
                      <span className="inline-flex items-center gap-1"><Hand className="h-3 w-3" /> agent</span>
                    )}
                  </Badge>
                  {session.secretSafe && (
                    <Badge variant="destructive">
                      <Shield className="mr-1 h-3 w-3" />
                      secret-safe
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <dl className="mt-3 space-y-2 text-xs">
              {getBrowserSessionDetails(session).map((detail) => (
                <div key={`${session.id}:${detail.label}`} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                  <dt className="text-muted-foreground">{detail.label}</dt>
                  <dd className="break-all font-mono text-foreground">{detail.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              {renderOpenAction(session)}
              {session.controller !== 'user' ? (
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onTakeControl(session.id)}>
                  <Hand className="mr-1.5 h-3.5 w-3.5" />
                  Take control
                </Button>
              ) : (
                <>
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onReturnControl(session.id)}>
                    <UserRound className="mr-1.5 h-3.5 w-3.5" />
                    Return control
                  </Button>
                  {session.status !== 'ready' && (
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onResume(session.id)}>
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                      Resume agent
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
