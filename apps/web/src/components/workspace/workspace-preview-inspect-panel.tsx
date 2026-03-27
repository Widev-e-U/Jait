export interface PreviewInspectInteractiveElement {
  role?: string
  name?: string
  text?: string
  selector?: string
  tagName?: string
  placeholder?: string
  disabled?: boolean
  active?: boolean
  value?: string
}

export interface PreviewInspectDialogPresence extends PreviewInspectInteractiveElement {
  title?: string
  ariaModal?: boolean
  open?: boolean
}

export interface PreviewInspectObstructionElement {
  role?: string
  tagName?: string
  text?: string
  selector?: string
  reason: string
  zIndex?: number
}

export interface PreviewInspectObstructionDiagnostics {
  hasModal: boolean
  dialogCount: number
  activeDialogTitle?: string | null
  topLayer: PreviewInspectObstructionElement[]
  notes: string[]
}

export interface PreviewInspectTargetDiagnostics extends PreviewInspectInteractiveElement {
  selector: string
  found: boolean
  offscreen?: boolean
  obscured?: boolean
  obstructionReason?: string
  interceptedBy?: PreviewInspectObstructionElement | null
  inDialog?: boolean
  dialogTitle?: string | null
}

export interface PreviewInspectPageSnapshot {
  url: string
  title: string
  text: string
  elements: PreviewInspectInteractiveElement[]
  activeElement?: PreviewInspectInteractiveElement | null
  dialogs?: PreviewInspectDialogPresence[]
  obstruction?: PreviewInspectObstructionDiagnostics | null
}

export interface PreviewInspectRenderState {
  status: 'starting' | 'ready' | 'error' | 'stopped'
  url: string | null
  page: PreviewInspectPageSnapshot | null
  snapshot: string | null
  target?: PreviewInspectTargetDiagnostics | null
  captureSuppressed?: boolean
  suppressionReason?: string
}

interface WorkspacePreviewInspectPanelProps {
  inspectState: PreviewInspectRenderState | null
  loading?: boolean
  error?: string | null
}

export function WorkspacePreviewInspectPanel({
  inspectState,
  loading = false,
  error = null,
}: WorkspacePreviewInspectPanelProps) {
  if (error) {
    return (
      <div className="rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-destructive">
        {error}
      </div>
    )
  }

  if (loading) {
    return <div className="text-muted-foreground">Inspecting preview…</div>
  }

  if (inspectState?.captureSuppressed) {
    return (
      <div className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-amber-700">
        {inspectState.suppressionReason ?? 'Preview inspection is currently suppressed.'}
      </div>
    )
  }

  if (!inspectState) {
    return <div className="text-muted-foreground">No inspection data available yet.</div>
  }

  return (
    <>
      <div className="rounded border bg-muted/30 p-2">
        <div className="font-medium text-foreground">{inspectState.page?.title || '(untitled)'}</div>
        <div className="mt-1 break-all text-muted-foreground">
          <code>{inspectState.url ?? inspectState.page?.url ?? 'Unknown URL'}</code>
        </div>
      </div>
      <div className="rounded border p-2">
        <div className="font-medium text-foreground">Active Element</div>
        {inspectState.page?.activeElement ? (
          <div className="mt-1 space-y-1 text-muted-foreground">
            <div>{[inspectState.page.activeElement.role ?? inspectState.page.activeElement.tagName ?? 'element', inspectState.page.activeElement.name].filter(Boolean).join(' - ')}</div>
            {inspectState.page.activeElement.selector ? <div><code>{inspectState.page.activeElement.selector}</code></div> : null}
          </div>
        ) : (
          <div className="mt-1 text-muted-foreground">No active input detected.</div>
        )}
      </div>
      <div className="rounded border p-2">
        <div className="font-medium text-foreground">Dialogs</div>
        {inspectState.page?.dialogs?.length ? (
          <div className="mt-1 space-y-1 text-muted-foreground">
            {inspectState.page.dialogs.map((dialog, index) => (
              <div key={`${dialog.selector ?? dialog.title ?? index}`} className="rounded bg-muted/40 px-2 py-1">
                <div>{dialog.title || dialog.name || dialog.role || 'dialog'}</div>
                {dialog.selector ? <div><code>{dialog.selector}</code></div> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-1 text-muted-foreground">No visible dialogs detected.</div>
        )}
      </div>
      <div className="rounded border p-2">
        <div className="font-medium text-foreground">Obstruction</div>
        {inspectState.page?.obstruction ? (
          <div className="mt-1 space-y-1 text-muted-foreground">
            <div>
              Modal: {inspectState.page.obstruction.hasModal ? 'yes' : 'no'} · Dialogs: {inspectState.page.obstruction.dialogCount}
            </div>
            {inspectState.page.obstruction.activeDialogTitle ? (
              <div>Active dialog: {inspectState.page.obstruction.activeDialogTitle}</div>
            ) : null}
            {inspectState.page.obstruction.notes.map((note, index) => (
              <div key={`${note}:${index}`}>{note}</div>
            ))}
          </div>
        ) : (
          <div className="mt-1 text-muted-foreground">No obstruction diagnostics available.</div>
        )}
      </div>
      {inspectState.target ? (
        <div className="rounded border p-2">
          <div className="font-medium text-foreground">Selector Diagnosis</div>
          <div className="mt-1 space-y-1 text-muted-foreground">
            <div><code>{inspectState.target.selector}</code></div>
            <div>Found: {inspectState.target.found ? 'yes' : 'no'}</div>
            {inspectState.target.obscured != null ? <div>Obscured: {inspectState.target.obscured ? 'yes' : 'no'}</div> : null}
            {inspectState.target.offscreen != null ? <div>Offscreen: {inspectState.target.offscreen ? 'yes' : 'no'}</div> : null}
            {inspectState.target.dialogTitle ? <div>Dialog: {inspectState.target.dialogTitle}</div> : null}
            {inspectState.target.obstructionReason ? <div>{inspectState.target.obstructionReason}</div> : null}
            {inspectState.target.interceptedBy ? (
              <div>
                Intercepted by {inspectState.target.interceptedBy.role ?? inspectState.target.interceptedBy.tagName ?? 'element'}
                {inspectState.target.interceptedBy.selector ? ` (${inspectState.target.interceptedBy.selector})` : ''}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
