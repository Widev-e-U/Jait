import { useMemo, useState } from 'react'
import { AlertTriangle, ExternalLink, Eye, Monitor, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { BrowserIntervention, BrowserSession } from '@/lib/browser-collaboration-api'
import type { DevPreviewPanelState } from '@jait/shared'
import {
  canOpenLiveSessionInPreview,
  getBrowserSessionOpenTarget,
  getPreviewSurfaceStatus,
  getPreviewSurfaceStorageScope,
} from './browser-collaboration-panel-helpers'

interface BrowserCollaborationPanelProps {
  sessions: BrowserSession[]
  interventions: BrowserIntervention[]
  loading?: boolean
  previewState?: DevPreviewPanelState | null
  onRefresh: () => void
  onOpenLiveSession: (target: string | null, workspaceRoot?: string | null, browserSessionId?: string | null) => void
  onResolveIntervention: (interventionId: string, userNote?: string) => Promise<void>
}

export function BrowserCollaborationPanel(props: BrowserCollaborationPanelProps) {
  const { sessions, interventions, loading, previewState, onRefresh, onOpenLiveSession, onResolveIntervention } = props
  const [noteByIntervention, setNoteByIntervention] = useState<Record<string, string>>({})
  const openInterventions = useMemo(() => interventions.filter((item) => item.status === 'open'), [interventions])
  const sessionsById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions])
  const previewSurfaceStatus = getPreviewSurfaceStatus(previewState)
  const previewStorageScope = getPreviewSurfaceStorageScope(previewState)

  const renderOpenAction = (session: BrowserSession) => {
    const liveTarget = getBrowserSessionOpenTarget(session)
    if (!liveTarget) return null
    if (canOpenLiveSessionInPreview(session)) {
      return (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => onOpenLiveSession(liveTarget, session.workspaceRoot, session.id)}
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

  if (openInterventions.length === 0) return null

  return (
    <div className="fixed left-4 bottom-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border bg-background/95 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Monitor className="h-4 w-4" />
            Browser Collaboration
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {openInterventions.length} intervention{openInterventions.length === 1 ? '' : 's'} need attention.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant={previewSurfaceStatus === 'connected' ? 'default' : 'outline'}>
              Preview {previewSurfaceStatus}
            </Badge>
            <Badge variant={previewStorageScope === 'shared-browser' ? 'secondary' : 'outline'}>
              {previewStorageScope === 'shared-browser' ? 'Storage shared with app' : previewStorageScope}
            </Badge>
            {previewSurfaceStatus === 'connected' && previewState?.displayTarget ? (
              <Badge variant="outline" className="max-w-[220px] truncate">
                {previewState.displayTarget}
              </Badge>
            ) : null}
          </div>
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
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span>{item.reason}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.instructions}</div>
                  {session ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Open <span className="font-medium text-foreground">{session.name}</span> in the preview surface to complete this step.
                    </div>
                  ) : null}
                </div>
                <Badge variant={item.secretSafe ? 'destructive' : 'secondary'}>
                  {item.secretSafe ? 'Secret-safe' : 'Needs input'}
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
                <Button size="sm" className="h-8 text-xs" onClick={() => onResolveIntervention(item.id, noteByIntervention[item.id])}>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  Continue
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
