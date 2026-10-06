import { useEffect, useMemo, useState } from 'react'
import { JaitClient } from '@jait/api-client'
import type { SecurityBaselineComparison, SecurityCheckInput, SecurityCheckRun, SecurityEngineStatus, SecurityFinding, SecurityProfile, SecurityRemediationPlan, SecurityWorkbenchHistory } from '@jait/shared'
import { Button } from '@/components/ui/button'
import { getApiUrl } from '@/lib/gateway-url'
import { ServiceChecks } from './service-checks'

const PROFILES: Array<{ id: SecurityProfile; label: string; description: string }> = [
  { id: 'tls', label: 'TLS certificate', description: 'Certificate dates, gateway trust, identity and negotiated TLS >=1.2.' },
  { id: 'http', label: 'HTTP headers', description: 'One GET / over HTTP. Redirects are not followed; bodies, cookies and credentials are discarded.' },
  { id: 'https', label: 'HTTPS headers', description: 'One GET / over HTTPS, including HSTS policy. Check certificate trust separately with TLS.' },
  { id: 'ssh', label: 'SSH identification', description: 'Read the SSH identification line without authentication. A banner does not confirm a CVE.' },
  { id: 'host-audit', label: 'Read-only host audit', description: 'Gateway OS and SSH file directives, or fixed remote audit with an approved SSH user and existing trusted keys.' },
  { id: 'nmap', label: 'Nmap TCP inventory', description: 'Selected-port unprivileged TCP checks. No scripts, DNS, OS detection, UDP or version probes.' },
  { id: 'nuclei', label: 'Reviewed web check', description: 'Only the pinned GET / nosniff template, with an independent response check. No redirects or callbacks.' },
  { id: 'trivy', label: 'Software configuration', description: 'Offline Trivy configuration checks on a bounded Linux project snapshot. No secrets or database downloads.' },
  { id: 'telemetry', label: 'Import sensor alerts', description: 'Import a scoped Wazuh/Suricata JSONL file from the Linux gateway; source alerts remain unverified reports.' },
]
export function SecurityWorkbench({ token, sessionId }: { token: string | null; sessionId?: string }) {
  const client = useMemo(() => new JaitClient({ baseUrl: getApiUrl(), wsUrl: '', token: token ?? undefined }), [token])
  const [tab, setTab] = useState<'checks' | 'tcp' | 'findings'>('checks')
  const [profile, setProfile] = useState<SecurityProfile>('tls')
  const [target, setTarget] = useState('')
  const [port, setPort] = useState('443')
  const [serverName, setServerName] = useState('')
  const [username, setUsername] = useState('')
  const [path, setPath] = useState('')
  const [source, setSource] = useState<'wazuh' | 'suricata'>('suricata')
  const [scheme, setScheme] = useState<'http' | 'https'>('http')
  const [includePackages, setIncludePackages] = useState(false)
  const [authorized, setAuthorized] = useState(false)
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<SecurityWorkbenchHistory>({ runs: [], findings: [] })
  const [engines, setEngines] = useState<SecurityEngineStatus[]>([])
  const [run, setRun] = useState<SecurityCheckRun | null>(null)
  const [comparison, setComparison] = useState<SecurityBaselineComparison | null>(null)
  const [plan, setPlan] = useState<SecurityRemediationPlan | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    void Promise.allSettled([client.securityWorkbench(), client.securityEngineStatus()]).then(([data, status]) => {
      if (disposed) return
      if (data.status === 'fulfilled') { setHistory(data.value); setRun(data.value.runs[0] ?? null) }
      else setError(String(data.reason?.message ?? 'Unable to load assessments'))
      if (status.status === 'fulfilled') setEngines(status.value)
    })
    return () => { disposed = true }
  }, [client])
  useEffect(() => {
    if (!run || run.status !== 'running') return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    async function update() {
      try {
        const next = await client.getSecurityCheck(run!.id)
        if (disposed) return
        setRun(next)
        if (next.status === 'running') timer = setTimeout(() => void update(), 500)
        else {
          const data = await client.securityWorkbench()
          if (!disposed) setHistory(data)
        }
      } catch (err) { if (!disposed) setError(err instanceof Error ? err.message : 'Unable to update check') }
    }
    timer = setTimeout(() => void update(), 500)
    return () => { disposed = true; clearTimeout(timer) }
  }, [client, run?.id, run?.status])
  useEffect(() => { setComparison(null) }, [run?.id])
  const baseline = run && history.runs.find(previous => previous.id !== run.id && previous.scopeId === run.scopeId && previous.startedAt < run.startedAt && previous.input.profile === run.input.profile)
  const selected = PROFILES.find(p => p.id === profile)!
  const fileProfile = profile === 'trivy' || profile === 'telemetry'
  const externalEngine = ['nmap', 'nuclei', 'trivy'].includes(profile) ? engines.find(engine => engine.name === profile) : undefined
  const running = run?.status === 'running'
  const resetConsent = (action: () => void) => { action(); setAuthorized(false) }
  async function operation(action: () => Promise<void>) {
    setBusy(true); setError(null); setMessage(null)
    try { await action() } catch (err) { setError(err instanceof Error ? err.message : 'Security operation failed') }
    finally { setBusy(false) }
  }
  async function start() {
    await operation(async () => {
      const scope = await client.createSecurityScope({
        targets: [target], exclusions: [], ports: [Number(port)], authorized,
        methods: [profile], paths: fileProfile ? [path] : [], serverNames: serverName ? [serverName] : [], sshUsernames: username ? [username] : [],
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(), ...(fileProfile ? { sessionId } : {}),
      })
      const input: SecurityCheckInput = { scopeId: scope.id, profile, ...(fileProfile ? { path, ...(profile === 'telemetry' ? { source } : {}) } : { target, port: Number(port) }),
        ...(profile === 'nuclei' ? { scheme } : {}), ...(profile === 'trivy' ? { includePackages } : {}),
        ...(profile === 'tls' && serverName ? { serverName } : {}), ...(profile === 'host-audit' && username ? { username } : {}) }
      setRun(await client.startSecurityCheck(input))
      setHistory(await client.securityWorkbench())
    })
  }
  async function verify(finding: SecurityFinding) {
    await operation(async () => {
      const result = await client.verifySecurityFinding(finding.id)
      setMessage(result.reason + ' Result: ' + result.status)
      setHistory(await client.securityWorkbench())
      setRun(await client.getSecurityCheck(result.runId))
    })
  }
  async function download() {
    if (!run) return
    await operation(async () => {
      const report = await client.exportSecurityReport(run.id)
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a'); link.href = url; link.download = 'jait-security-report.json'; link.click()
      URL.revokeObjectURL(url)
      setMessage('Redacted report exported. Review its content before sharing.')
    })
  }

  return <div className="flex-1 overflow-auto p-4 space-y-4" data-testid="security-workbench">
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Assessment views">
      <Button role="tab" aria-selected={tab === 'checks'} variant={tab === 'checks' ? 'default' : 'outline'} onClick={() => setTab('checks')}>Security checks</Button>
      <Button role="tab" aria-selected={tab === 'tcp'} variant={tab === 'tcp' ? 'default' : 'outline'} onClick={() => setTab('tcp')}>Service inventory</Button>
      <Button role="tab" aria-selected={tab === 'findings'} variant={tab === 'findings' ? 'default' : 'outline'} onClick={() => setTab('findings')}>Findings ({history.findings.length})</Button>
    </div>
    {error && <p role="alert" className="rounded border border-red-500 p-3 text-sm text-red-500">{error}</p>}
    {message && <p role="status" className="rounded border p-3 text-sm">{message}</p>}
    {tab === 'tcp' ? <ServiceChecks token={token} /> : <>
      {tab === 'checks' && <>
        <div><h3 className="text-lg font-semibold">Understand an exposure, then verify the change</h3>
          <p className="text-sm text-muted-foreground">Choose an authorized target and a bounded check. Each observation records evidence, scanner version, time and gateway vantage point.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Scanner availability">
          {engines.map(engine => <span key={engine.name}>{engine.name}: {engine.available ? engine.version : 'not installed'}</span>)}
        </div>
        <form className="rounded-lg border p-4 space-y-3" onSubmit={event => { event.preventDefault(); void start() }}>
          <label className="block text-sm">Check
            <select aria-label="Security check profile" className="mt-1 block w-full rounded border bg-background p-2" value={profile} onChange={event => resetConsent(() => setProfile(event.target.value as SecurityProfile))}>
              {PROFILES.map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
            </select>
          </label>
          <p className="text-sm text-muted-foreground">{selected.description}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Authorized target IP
              <input aria-label="Security target IP" className="mt-1 block w-full rounded border bg-background p-2" value={target} onChange={event => resetConsent(() => setTarget(event.target.value))} placeholder="Explicit owned IP; use the gateway IP for local work" />
            </label>
            <label className="text-sm">Authorized TCP port
              <input aria-label="Security target port" className="mt-1 block w-full rounded border bg-background p-2" value={port} onChange={event => resetConsent(() => setPort(event.target.value))} />
            </label>
          </div>
          {profile === 'tls' && <label className="block text-sm">Expected TLS server name (optional; no DNS resolution)
            <input aria-label="Expected TLS server name" className="mt-1 block w-full rounded border bg-background p-2" value={serverName} onChange={event => resetConsent(() => setServerName(event.target.value))} />
          </label>}
          {profile === 'host-audit' && <label className="block text-sm">Remote SSH username (leave empty for gateway audit)
            <input aria-label="Authorized SSH username" className="mt-1 block w-full rounded border bg-background p-2" value={username} onChange={event => resetConsent(() => setUsername(event.target.value))} />
          </label>}
          {fileProfile && <label className="block text-sm">Authorized project path
            <input aria-label="Authorized project path" disabled={!sessionId} className="mt-1 block w-full rounded border bg-background p-2" value={path} onChange={event => resetConsent(() => setPath(event.target.value))} placeholder={sessionId ? 'Project-relative path' : 'Select an owned project chat first'} />
          </label>}
          {profile === 'telemetry' && <label className="block text-sm">Sensor format
            <select aria-label="Sensor format" value={source} onChange={event => resetConsent(() => setSource(event.target.value as 'wazuh' | 'suricata'))}>
              <option value="suricata">Suricata EVE JSONL</option><option value="wazuh">Wazuh alert JSONL</option>
            </select>
          </label>}
          {profile === 'nuclei' && <label className="block text-sm">Web transport
            <select aria-label="Web transport" value={scheme} onChange={event => resetConsent(() => setScheme(event.target.value as 'http' | 'https'))}><option value="http">HTTP</option><option value="https">HTTPS</option></select>
          </label>}
          {profile === 'trivy' && <label className="flex gap-2 text-sm"><input type="checkbox" checked={includePackages} onChange={event => resetConsent(() => setIncludePackages(event.target.checked))} />Include package CVE correlation using a prepared local database (no downloads)</label>}
          <p className="text-xs text-muted-foreground">Gateway execution only. Scope expires in one hour; each run stops after 60 seconds. No automatic remediation. Network results do not establish WAN reachability.</p>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={authorized} onChange={event => setAuthorized(event.target.checked)} />I own or am authorized to assess this target/path using the selected method.</label>
          {externalEngine && !externalEngine.available && <p className="text-sm text-amber-600">Install {externalEngine.name} on the gateway to use this adapter. Native protocol checks are available now.</p>}
          <Button type="submit" disabled={!authorized || !target || busy || running || (fileProfile && (!sessionId || !path)) || externalEngine?.available === false}>Run selected check</Button>
        </form>
      </>}
      {run && tab === 'checks' && <section className="rounded-lg border p-4 space-y-3" aria-label="Security check results">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold">{run.input.profile} · {run.status}</h4>
          <div className="flex flex-wrap gap-2">
            {running ? <Button variant="outline" onClick={() => void operation(async () => { await client.cancelSecurityCheck(run.id) })}>Stop check</Button> :
              <Button variant="outline" disabled={busy || Date.parse(run.scope.expiresAt) <= Date.now()} onClick={() => void operation(async () => { setRun(await client.startSecurityCheck(run.input)) })}>Repeat check</Button>}
            {baseline && !running && <Button variant="outline" disabled={busy} onClick={() => void operation(async () => { setComparison(await client.compareSecurityChecks(baseline.id, run.id)) })}>Compare previous check</Button>}
            <Button variant="outline" disabled={busy || running} onClick={() => void download()}>Export redacted report</Button>
          </div>
        </div>
        <p className="text-sm">{run.evidence.length} evidence items · {run.findingIds.length} observations · {run.engine} {run.engineVersion}</p>
        <p className="text-xs text-muted-foreground">From {run.scope.vantagePoint} · {new Date(run.startedAt).toLocaleString()} · {run.profileRevision}</p>
        {run.status === 'unavailable' && <p className="text-amber-600 text-sm">The required scanner is unavailable. This run provides no passing result.</p>}
        {comparison && <div className="rounded border p-3 text-sm" aria-label="Baseline comparison">
          <h5 className="font-medium">Change since the previous check</h5>
          {comparison.comparable ? <><p>Newly observed rules: {comparison.addedRules.join(", ") || "none"}.</p><p>No longer observed rules: {comparison.noLongerObservedRules.join(", ") || "none"}.</p><p className="text-xs text-muted-foreground">Rule absence describes these checks; use finding verification to record a fix.</p></> : <p>These runs are not comparable. Review their scope, completion and scanner versions.</p>}
          <ul className="list-disc pl-5">{comparison.coverageGaps.map(gap => <li key={gap}>{gap}</li>)}</ul>
        </div>}
        {run.evidence.map(item => <details key={item.id} className="rounded border p-2 text-sm">
          <summary className="cursor-pointer">{item.target}{item.port !== undefined ? ':' + item.port : ''} · {item.summary}</summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({ evidenceId: item.id, observedAt: item.observedAt, ...item.facts }, null, 2)}</pre>
        </details>)}
        <div className="text-sm"><h5 className="font-medium">Coverage and limits</h5><ul className="list-disc pl-5">{run.coverageGaps.map(gap => <li key={gap}>{gap}</li>)}</ul></div>
        {!running && ['tls', 'http', 'https', 'ssh', 'nmap'].includes(run.input.profile) && <Button variant="outline" disabled={busy || Date.parse(run.scope.expiresAt) <= Date.now()} onClick={() => void operation(async () => {
          const monitor = await client.scheduleSecurityMonitor({ ...run.input, minutes: 15 })
          setMessage('Monitor ' + monitor.jobId + ' scheduled every 15 minutes until ' + new Date(monitor.expiresAt).toLocaleTimeString() + '. It disables itself when authorization expires.')
        })}>Monitor this check every 15 minutes</Button>}
        <details className="text-xs"><summary className="cursor-pointer">Inspect exact authorization and provenance</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap">{JSON.stringify({ scope: run.scope, artifact: run.artifact, input: run.input }, null, 2)}</pre></details>
      </section>}
      {tab === 'findings' && <>
        <h3 className="text-lg font-semibold">Findings and verification</h3>
        {history.findings.length === 0 && <p className="text-sm text-muted-foreground">No findings recorded. Review completed checks and their coverage; this does not prove security.</p>}
        {history.findings.map(finding => <section key={finding.id} className="rounded-lg border p-4 space-y-2" aria-label={finding.title}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{finding.title}</h4><span className="text-xs">{finding.severity} · {finding.status} · {finding.confidence} confidence · {finding.disposition}</span></div>
          <p className="text-sm">{finding.target}{finding.port !== undefined ? ':' + finding.port : ''} · rule {finding.ruleId}</p>
          <p className="text-sm text-muted-foreground">{finding.remediation}</p>
          <p className="text-xs text-muted-foreground">Evidence: {finding.evidenceIds.join(', ')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || running} onClick={() => void operation(async () => { setRun(await client.getSecurityCheck(finding.runId)); setTab("checks") })}>Inspect cited evidence</Button>
            {finding.verifiedByRunId && <Button variant="outline" disabled={busy || running} onClick={() => void operation(async () => { setRun(await client.getSecurityCheck(finding.verifiedByRunId!)); setTab("checks") })}>Inspect verification evidence</Button>}
            <Button variant="outline" disabled={busy || running} onClick={() => void operation(async () => { setPlan(await client.getSecurityRemediationPlan(finding.id)) })}>Prepare fix and rollback</Button>
            <Button disabled={busy || running} onClick={() => void verify(finding)}>Verify same check</Button>
            {finding.disposition !== "open" && <Button variant="outline" disabled={busy} onClick={() => void operation(async () => { await client.decideSecurityFinding(finding.id, "open"); setHistory(await client.securityWorkbench()) })}>Reopen finding</Button>}
            <Button variant="outline" disabled={busy} onClick={() => void operation(async () => { await client.decideSecurityFinding(finding.id, 'accepted-risk'); setHistory(await client.securityWorkbench()) })}>Accept risk</Button>
            <Button variant="outline" disabled={busy} onClick={() => void operation(async () => { await client.decideSecurityFinding(finding.id, 'false-positive'); setHistory(await client.securityWorkbench()) })}>Mark false positive</Button>
          </div>
        </section>)}
        {plan && <section className="rounded-lg border p-4 space-y-2" aria-label="Remediation plan">
          <h4 className="font-semibold">Review the fix for {plan.target}</h4>
          <ol className="list-decimal pl-5 text-sm">{plan.steps.map(step => <li key={step}>{step}</li>)}</ol>
          <h5 className="font-medium">Rollback</h5><ul className="list-disc pl-5 text-sm">{plan.rollback.map(step => <li key={step}>{step}</li>)}</ul>
          <p className="text-sm text-muted-foreground">Apply the reviewed change through the existing consent workflow. Verification updates the finding only after a compatible, conclusive check.</p>
        </section>}
      </>}
      {tab === 'checks' && history.runs.length > 0 && <section className="space-y-2">
        <h4 className="font-semibold">Assessment history</h4>
        {history.runs.map(previous => <div key={previous.id} className="flex gap-2">
          <button className="flex-1 rounded border p-2 text-left text-sm hover:bg-muted disabled:opacity-50" disabled={running} onClick={() => setRun(previous)}>{previous.input.profile} · {previous.status} · {new Date(previous.startedAt).toLocaleString()}</button>
          <Button variant="outline" size="sm" disabled={running || busy} onClick={() => void operation(async () => { await client.deleteSecurityCheck(previous.id); if (run?.id === previous.id) setRun(null); setHistory(await client.securityWorkbench()) })}>Delete run data</Button>
        </div>)}
      </section>}
    </>}
  </div>
}
