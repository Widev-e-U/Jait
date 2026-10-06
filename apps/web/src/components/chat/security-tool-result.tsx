import type { ReactNode } from 'react'
import { getSecurityResultModel, securityRecord, securityRows, securityState, securityStrings, securityTarget, securityText, type SecurityRecord } from '@/lib/security-tool-results'

function State({ value }: { value: unknown }) {
  const state = securityText(value)
  const caution = ['partial', 'cancelled', 'interrupted', 'inconclusive', 'still-observed', 'suspected', 'timeout', 'unknown'].includes(state)
  return <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${caution ? 'border-amber-500/40 text-amber-600 dark:text-amber-400' : state === 'verified-absent' ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : 'border-border'}`}>{securityState(value)}</span>
}
function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return <div><p className="font-medium">{title}</p><ul className="mt-1 list-disc space-y-1 pl-5">{items.map((item, index) => <li className="break-words" key={index}>{item}</li>)}</ul></div>
}
function Coverage({ value }: { value: unknown }) {
  const gaps = securityStrings(value)
  return gaps.length ? <aside aria-label="Coverage gaps" className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
    <List title="Coverage gaps — these results are incomplete" items={gaps} />
  </aside> : null
}
function MoreRows({ rows, children, label }: { rows: SecurityRecord[]; children: (row: SecurityRecord, index: number) => ReactNode; label: string }) {
  return <>{rows.slice(0, 5).map(children)}{rows.length > 5 && <details className="rounded border p-2">
    <summary className="cursor-pointer">Show {rows.length - 5} more {label}</summary>
    <div className="mt-2 space-y-2">{rows.slice(5).map((row, index) => children(row, index + 5))}</div>
  </details>}</>
}
function Facts({ value }: { value: unknown }) {
  const facts = securityRecord(value)
  if (!facts) return null
  // Scanner artifacts and credential-like fields never become generic JSON output.
  const entries = Object.entries(facts).filter(([key, value]) =>
    (!/password|secret|token|authorization|cookie|credential|raw|body/i.test(key)
      || (key === 'passwordAuthenticationDirective' && (value === null || value === 'yes' || value === 'no')))
    && (value === null || ['string', 'number', 'boolean'].includes(typeof value))).slice(0, 32)
  return <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-3 gap-y-1">
    {entries.map(([key, value]) => <div key={key} className="contents">
      <dt className="break-words text-muted-foreground">{key.slice(0, 100).replace(/([a-z])([A-Z])/g, '$1 $2')}</dt>
      <dd className="break-all">{value === null ? 'Unknown' : securityText(String(value))}</dd>
    </div>)}
  </dl>
}
function Evidence({ rows }: { rows: SecurityRecord[] }) {
  return <section aria-label="Cited evidence" className="space-y-2">
    <p className="font-medium">Evidence ({rows.length})</p>
    {rows.length === 0 && <p className="text-muted-foreground">No evidence was recorded.</p>}
    <MoreRows rows={rows} label="evidence entries">{(row, index) => <details className="rounded border p-2" key={index}>
      <summary className="cursor-pointer break-words">{securityTarget(row)} · {securityText(row.summary) || securityState(row.state)}</summary>
      <div className="mt-2 space-y-2">
        <p className="break-all text-muted-foreground">Evidence ID: {securityText(row.id ?? row.evidenceId)} · {securityText(row.observedAt)}</p>
        {typeof row.state === 'string' && <State value={row.state} />}
        <Facts value={row.facts} />
      </div>
    </details>}</MoreRows>
  </section>
}
function Findings({ rows }: { rows: SecurityRecord[] }) {
  return <section aria-label="Security findings" className="space-y-2">
    <p className="font-medium">Findings ({rows.length})</p>
    {!rows.length && <p className="text-muted-foreground">No findings recorded by this check. This does not prove the target is secure.</p>}
    <MoreRows rows={rows} label="findings">{(row, index) => <article className="rounded border p-2 space-y-2" key={index}>
      <p className="font-medium break-words">{securityText(row.title)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-muted px-2 py-0.5 text-xs">Severity: {securityText(row.severity)}</span>
        <State value={row.status} /><State value={row.disposition} />
        <span className="text-xs text-muted-foreground">Confidence: {securityText(row.confidence)}</span>
      </div>
      <p className="break-all">{securityTarget(row)}</p>
      <details>
        <summary className="cursor-pointer">Evidence references and suggested fix</summary>
        <div className="mt-2 space-y-2">
          <p className="break-all text-muted-foreground">Finding ID: {securityText(row.id)} · Rule: {securityText(row.ruleId)}</p>
          <List title="Cited evidence IDs" items={securityStrings(row.evidenceIds)} />
          <p>Suggested fix: {securityText(row.remediation, 2000) || 'No recommendation recorded.'}</p>
          <p>Rollback: {securityText(row.rollback, 2000) || 'Prepare a rollback before making a change.'}</p>
          {typeof row.verifiedByRunId === 'string' && <p className="break-all">Verification run: {securityText(row.verifiedByRunId)}</p>}
        </div>
      </details>
    </article>}</MoreRows>
  </section>
}
function Run({ row, findings }: { row: SecurityRecord; findings?: SecurityRecord[] }) {
  const scope = securityRecord(row.scope)
  const input = securityRecord(row.input)
  const targets = input ? securityTarget(input) || securityText(input.path) : ''
  const native = Array.isArray(row.observations)
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2"><State value={row.status} />
      <span className="font-medium break-all">{targets || securityStrings(scope?.targets).join(', ') || securityText(row.profile)}</span>
    </div>
    <p className="break-words text-muted-foreground">{securityText(row.engine)} {securityText(row.engineVersion)} · Vantage: {securityText(scope?.vantagePoint ?? row.vantagePoint) || 'Not recorded'} · {securityText(row.completedAt ?? row.startedAt)}</p>
    <p className="break-all text-muted-foreground">Run ID: {securityText(row.id)}</p>
    <Coverage value={row.coverageGaps} />
    {native ? <p>{securityRows(row.observations).length} of {typeof row.plannedChecks === 'number' ? row.plannedChecks : '?'} planned TCP checks. Open ports are observations, not vulnerabilities.</p>
      : findings || Array.isArray(row.findings) ? <Findings rows={findings ?? securityRows(row.findings)} />
      : <p>Finding details were not included in this result.</p>}
    {!native && <p className="text-xs text-muted-foreground">Findings show the state recorded at this assessment.</p>}
    <Evidence rows={securityRows(native ? row.observations : row.evidence)} />
    <p className="text-xs text-muted-foreground">Coverage applies to this check and vantage point. LAN results do not establish WAN reachability.</p>
  </div>
}
function Comparison({ row }: { row: SecurityRecord }) {
  return <div className="space-y-2">
    <State value={row.comparable === true ? 'completed' : 'inconclusive'} />
    <Coverage value={row.coverageGaps} />
    {row.comparable === true && <>
      <List title="New observations" items={securityStrings(row.addedRules)} />
      <List title="No longer observed" items={securityStrings(row.noLongerObservedRules)} />
      {!securityStrings(row.addedRules).length && !securityStrings(row.noLongerObservedRules).length && <p>No rule changes observed.</p>}
    </>}
    <p className="text-muted-foreground">Comparison alone does not verify a fix.</p>
    <p className="break-all text-muted-foreground">Before: {securityText(row.beforeRunId)} · After: {securityText(row.afterRunId)}</p>
  </div>
}
export function SecurityToolResult({ tool, data, message, ok }: { tool: string; data?: unknown; message?: string; ok?: boolean }) {
  const model = getSecurityResultModel(tool, data, message)
  let content: ReactNode
  if (!model) {
    // Never fall back to rendering raw scanner reports or arbitrary envelope JSON.
    const readableMessage = message && message.length <= 1000 && !/[[{]/.test(message) ? message : ''
    content = <p role={ok === false ? 'alert' : 'status'}>{readableMessage || 'Structured security results could not be read. No security conclusion is available.'}</p>
  } else if (Array.isArray(model.payload)) {
    content = model.kind === 'findings' ? <Findings rows={model.payload} /> : <div className="space-y-2">
      {model.payload.map((row, index) => <p key={index}><strong>{securityText(row.name)}:</strong> {row.available ? securityText(row.version) || 'Installed; version unknown' : 'Not installed'}</p>)}
      {!model.payload.length && <p>No scanner availability information recorded.</p>}
    </div>
  } else {
    const row = model.payload
    switch (model.kind) {
      case 'run': content = <Run row={row} />; break
      case 'report': content = <div className="space-y-3"><p className="font-medium">Redacted report — review before sharing</p><Run row={securityRecord(row.run)!} findings={securityRows(row.findings)} /></div>; break
      case 'explanation': content = <div className="space-y-3"><Findings rows={[securityRecord(row.finding)!]} /><Coverage value={row.coverageGaps} /><Evidence rows={securityRows(row.evidence)} /><p className="text-muted-foreground">{securityText(row.engine)} {securityText(row.engineVersion)}</p></div>; break
      case 'plan': content = <div className="space-y-3">
        <p className="font-medium">Review this fix before applying it</p><p className="break-all">{securityTarget(row)}</p>
        <p>{securityText(row.recommendation, 2000)}</p><List title="Proposed steps" items={securityStrings(row.steps)} />
        <List title="Rollback" items={securityStrings(row.rollback)} /><p>System changes require the existing approval workflow. Preparing this plan does not apply it.</p>
        <p className="break-all text-muted-foreground">Finding ID: {securityText(row.findingId)}</p>
      </div>; break
      case 'verification': content = <div className="space-y-2">
        <State value={row.status} /><p>{securityText(row.reason, 2000)}</p>
        <p>{row.status === 'verified-absent' ? 'The original issue was absent in a compatible repeat check. This is not a whole-system security guarantee.' : row.status === 'still-observed' ? 'The issue remains. Review the change and its evidence.' : 'This check could not establish whether the issue is fixed.'}</p>
        <p className="break-all text-muted-foreground">Finding ID: {securityText(row.findingId)} · Verification run: {securityText(row.runId)}</p>
      </div>; break
      case 'comparison': content = <Comparison row={row} />; break
      case 'scope': content = <div className="space-y-2">
        <List title="Authorized targets" items={securityStrings(row.targets)} /><List title="Excluded targets" items={securityStrings(row.exclusions)} />
        {!securityStrings(row.exclusions).length && <p>Excluded targets: None</p>}
        <List title="Authorized project paths" items={securityStrings(row.paths)} /><List title="Expected TLS names" items={securityStrings(row.serverNames)} />
        <p>Ports: {Array.isArray(row.ports) ? row.ports.filter(port => typeof port === 'number').join(', ') : 'Not recorded'}</p>
        <p>Methods: {securityStrings(row.methods).join(', ') || 'TCP inventory'}</p><p>Authorization expires: {securityText(row.expiresAt)}</p>
        <p>Vantage: {securityText(row.vantagePoint)} · {securityText(row.nodeId)}</p><p className="break-all">Scope ID: {securityText(row.id)}</p>
        <p className="text-muted-foreground">Recording a scope does not perform checks.</p>
      </div>; break
      case 'assets': content = <div className="space-y-2"><Coverage value={row.coverageGaps} />
        <p className="text-muted-foreground">Responsiveness is not device identity or a security verdict.</p>
        {securityRows(row.assets).map((asset, index) => <div className="rounded border p-2" key={index}><p>{securityTarget(asset)} · <State value={asset.status} /></p><List title="Evidence IDs" items={securityStrings(asset.evidenceIds)} /></div>)}
        <p className="text-muted-foreground">Vantage: {securityText(row.vantagePoint)} · {securityText(row.scannedAt)}</p>
      </div>; break
      case 'history': content = <div className="space-y-2">
        {!securityRows(row.runs).length && <p>No saved assessments.</p>}
        <MoreRows rows={securityRows(row.runs)} label="assessments">{(run, index) => <details className="rounded border p-2" key={index}>
          <summary className="cursor-pointer">{securityState(run.status)} · {securityText(run.startedAt)}</summary>
          <div className="mt-2 space-y-2"><p className="break-all">Run ID: {securityText(run.id)}</p><p>{String(run.performedChecks ?? '?')} of {String(run.plannedChecks ?? '?')} checks · {String(run.reachablePorts ?? '?')} reachable ports</p><Coverage value={run.coverageGaps} /><p>Vantage: {securityText(run.vantagePoint)}</p></div>
        </details>}</MoreRows>
      </div>; break
      case 'monitor': content = <div className="space-y-2">
        {row.expiresAt ? <><p>Monitoring scheduled until authorization expires: {securityText(row.expiresAt)}</p><p className="break-all">Job ID: {securityText(row.jobId)} · Scope ID: {securityText(row.scopeId)}</p></> : <p className="break-all">Monitoring run: {securityText(row.runId)}</p>}
        <Coverage value={row.coverageGaps} />
        {securityRecord(row.comparison) && <Comparison row={securityRecord(row.comparison)!} />}
      </div>; break
    }
  }
  const payload = model && !Array.isArray(model.payload) ? model.payload : null
  const run = securityRecord(payload?.run)
  const omitted = model?.truncated || (Array.isArray(model?.payload) ? model.payload.length > 256
    : [payload?.findings, payload?.evidence, payload?.observations, payload?.assets, payload?.runs, run?.evidence].some(value => Array.isArray(value) && value.length > 256))
  return <section aria-label="Security tool result" data-testid="security-tool-result" className="space-y-3 text-sm">{content}{omitted && <p className="text-xs text-muted-foreground">Some entries are omitted from this chat view. The saved assessment retains the complete result.</p>}</section>
}
