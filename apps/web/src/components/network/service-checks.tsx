import { useEffect, useState } from 'react'
import type { SecurityAssessmentHistory, SecurityAssessmentRun, SecurityScope } from '@jait/shared'
import { Button } from '@/components/ui/button'
import { getApiUrl } from '@/lib/gateway-url'

const API_URL = getApiUrl()
const COMMON_PORTS: Record<number, string> = { 22: 'SSH', 53: 'DNS', 80: 'HTTP', 139: 'NetBIOS', 443: 'HTTPS', 445: 'SMB', 554: 'RTSP', 8000: 'Web application', 8080: 'Web application' }
const STATE_LABELS = { open: 'Reachable', refused: 'Connection refused', timeout: 'Timed out — unknown', error: 'Network error — unknown' }

export function ServiceChecks({ token }: { token: string | null }) {
  const [targets, setTargets] = useState('')
  const [exclusions, setExclusions] = useState('')
  const [ports, setPorts] = useState('22, 80, 443')
  const [authorized, setAuthorized] = useState(false)
  const [history, setHistory] = useState<SecurityAssessmentHistory>({ scopes: [], runs: [] })
  const [run, setRun] = useState<SecurityAssessmentRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function api<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(API_URL + path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Request failed')
    return result as T
  }

  useEffect(() => {
    let disposed = false
    void api<SecurityAssessmentHistory>('/api/security/assessments')
      .then(result => { if (!disposed) { setHistory(result); setRun(result.runs[0] ?? null) } })
      .catch(err => { if (!disposed) setError(String(err.message)) })
    return () => { disposed = true }
    // api uses the current authentication token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    if (!run || run.status !== 'running') return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try {
        const result = await api<SecurityAssessmentRun>('/api/security/assessments/' + run.id)
        if (disposed) return
        setRun(result)
        if (result.status === 'running') timer = setTimeout(() => void refresh(), 500)
        else setHistory(await api<SecurityAssessmentHistory>('/api/security/assessments'))
      } catch (err) { if (!disposed) setError(err instanceof Error ? err.message : 'Unable to update assessment') }
    }
    timer = setTimeout(() => void refresh(), 500)
    return () => { disposed = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id, run?.status, token])

  const parseIps = (text: string) => text.split(/[\s,]+/).filter(Boolean)
  const running = run?.status === 'running'
  async function start(scopeId?: string) {
    setBusy(true); setError(null)
    try {
      const scope = scopeId ? { id: scopeId } : await api<SecurityScope>('/api/security/scopes', {
        targets: parseIps(targets), exclusions: parseIps(exclusions), ports: parseIps(ports).map(Number),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(), authorized,
      })
      setRun(await api<SecurityAssessmentRun>('/api/security/assessments', { scopeId: scope.id }))
      setHistory(await api<SecurityAssessmentHistory>('/api/security/assessments'))
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to start assessment') }
    finally { setBusy(false) }
  }
  async function cancel() {
    if (!run) return
    try { await api('/api/security/assessments/' + run.id + '/cancel', {}) }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to cancel assessment') }
  }
  const baseline = run ? history.runs.find(previous => previous.scopeId === run.scopeId && previous.id !== run.id && previous.startedAt < run.startedAt && previous.status === 'completed') : undefined

  return <div className="overflow-auto p-4 space-y-5" data-testid="service-checks">
    <div>
      <h3 className="text-lg font-semibold">Service checks</h3>
      <p className="text-sm text-muted-foreground">See which TCP ports accept connections from the Jait gateway. Start with a few servers or your router.</p>
      <p className="text-sm text-muted-foreground">Open ports need context; they do not confirm a vulnerability. LAN checks cannot prove Internet exposure.</p>
    </div>
    <form className="rounded-lg border p-4 space-y-3" onSubmit={event => { event.preventDefault(); void start() }}>
      <label className="block text-sm">Authorized target IPs (up to 16)
        <input aria-label="Authorized target IPs" className="mt-1 block w-full rounded border bg-background p-2" value={targets} placeholder="Enter IPs you own or have permission to assess" onChange={e => { setTargets(e.target.value); setAuthorized(false) }} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Excluded IPs
          <input aria-label="Excluded IPs" className="mt-1 block w-full rounded border bg-background p-2" value={exclusions} onChange={e => { setExclusions(e.target.value); setAuthorized(false) }} />
        </label>
        <label className="text-sm">TCP ports (up to 16)
          <input aria-label="TCP ports" className="mt-1 block w-full rounded border bg-background p-2" value={ports} onChange={e => { setPorts(e.target.value); setAuthorized(false) }} />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">One connection at a time, at most 5 starts/second, 750 ms per port, 60 seconds total. Scope expires after one hour. IPv4 only; no application requests or credentials.</p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} />
        I own or am authorized to check these targets and selected ports from the gateway.
      </label>
      <Button type="submit" disabled={!authorized || !targets.trim() || busy || running}>{busy ? 'Starting…' : 'Start service checks'}</Button>
    </form>
    {error && <p role="alert" className="rounded border border-red-500 p-3 text-sm text-red-500">{error}</p>}
    {run && <section className="rounded-lg border p-4 space-y-3" aria-label="Assessment results">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">Assessment {run.status}</h4>
        {running ? <Button variant="outline" onClick={() => void cancel()}>Stop checks</Button> :
          <Button variant="outline" disabled={busy || Date.parse(run.scope.expiresAt) <= Date.now()} onClick={() => void start(run.scopeId)}>Repeat same checks</Button>}
      </div>
      <p className="text-sm">{run.observations.length} / {run.plannedChecks} checks performed · {run.observations.filter(o => o.state === 'open').length} reachable ports</p>
      <p className="text-xs text-muted-foreground">From {run.scope.vantagePoint} (gateway) · {new Date(run.startedAt).toLocaleString()} · scope expires {new Date(run.scope.expiresAt).toLocaleTimeString()}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left"><th className="p-2">Target</th><th className="p-2">TCP port</th><th className="p-2">Observation</th><th className="p-2">Change</th></tr></thead>
          <tbody>{run.observations.map(observation => {
            const before = baseline?.observations.find(o => o.target === observation.target && o.port === observation.port)
            const change = !before ? 'No baseline' : before.state === observation.state ? 'Same observation' :
              observation.state === 'timeout' || observation.state === 'error' ? 'Inconclusive' :
              before.state === 'open' && observation.state === 'refused' ? 'Previously reachable; now refused' :
              observation.state === 'open' ? 'Now reachable' : 'Changed'
            return <tr key={observation.evidenceId} className="border-b">
              <td className="p-2 font-mono">{observation.target}</td>
              <td className="p-2">{observation.port}{COMMON_PORTS[observation.port] && <span className="block text-xs text-muted-foreground">Common use: {COMMON_PORTS[observation.port]} (unverified)</span>}</td>
              <td className="p-2">{STATE_LABELS[observation.state]}</td>
              <td className="p-2">{change}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
      <div className="text-sm">
        <h5 className="font-medium">Coverage and limits</h5>
        <ul className="list-disc pl-5">{run.coverageGaps.map(gap => <li key={gap}>{gap}</li>)}</ul>
      </div>
      <details className="text-xs"><summary className="cursor-pointer">Inspect evidence and authorization</summary>
        <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded bg-muted p-3">{JSON.stringify(run, null, 2)}</pre>
      </details>
    </section>}
    {history.runs.length > 0 && <section className="space-y-2">
      <h4 className="font-semibold">Recent assessments</h4>
      {history.runs.map(previous => <button key={previous.id} disabled={running} className="block w-full rounded border p-2 text-left text-sm hover:bg-muted disabled:opacity-50" onClick={() => setRun(previous)}>
        {new Date(previous.startedAt).toLocaleString()} · {previous.status} · {previous.scope.targets.length} targets · {previous.observations.length}/{previous.plannedChecks} checks
      </button>)}
    </section>}
  </div>
}
