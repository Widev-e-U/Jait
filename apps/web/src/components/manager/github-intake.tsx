import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { agentsApi, type GithubIntakeRule, type GithubIntakeState } from '@/lib/agents-api'

const events = ['issues', 'issue_comment', 'pull_request', 'pull_request_review', 'check_run', 'workflow_run']

export function GithubIntake({ agentId }: { agentId: string }) {
  const [data, setData] = useState<GithubIntakeState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [repository, setRepository] = useState('')
  const [sender, setSender] = useState('')
  const [event, setEvent] = useState('issues')
  const [action, setAction] = useState('opened')
  const load = useCallback(async () => {
    try { setData(await agentsApi.getGithubIntake(agentId)); setError('') }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load event intake') }
  }, [agentId])
  useEffect(() => { void load() }, [load])
  const save = async (rules: GithubIntakeRule[]) => {
    setBusy(true)
    try { await agentsApi.saveGithubIntake(agentId, rules); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save rules') }
    finally { setBusy(false) }
  }
  return <section className="mt-4 space-y-3 rounded-md border p-3 text-sm" aria-label="GitHub event intake">
    <div><h4 className="font-medium">GitHub event intake · Observe</h4>
      <p className="text-muted-foreground">Matching events are recorded as “would accept”. No work is started.</p></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {data && <>
      <div className="space-y-1"><strong>Rules</strong>
        {data.rules.length === 0 && <p className="text-muted-foreground">No rules yet. All events will be ignored.</p>}
        {data.rules.map((rule, index) => <div key={`${rule.repository}-${rule.sender}-${rule.event}-${rule.action}-${index}`} className="flex flex-wrap items-center gap-2">
          <span>{rule.repository} · {rule.sender} · {rule.event}/{rule.action}</span>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(data.rules.filter((_, i) => i !== index))}>Remove</Button>
        </div>)}
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); void save([...data.rules, { repository: repository.trim(), sender: sender.trim(), event, action: action.trim() }]) }}>
        <label>Repository <input className="block w-40 rounded border bg-background px-2 py-1" value={repository} onChange={e => setRepository(e.target.value)} placeholder="owner/repo" required /></label>
        <label>Sender <input className="block w-32 rounded border bg-background px-2 py-1" value={sender} onChange={e => setSender(e.target.value)} placeholder="GitHub login" required /></label>
        <label>Event <select className="block rounded border bg-background px-2 py-1" value={event} onChange={e => setEvent(e.target.value)}>{events.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Action <input className="block w-28 rounded border bg-background px-2 py-1" value={action} onChange={e => setAction(e.target.value)} required /></label>
        <Button size="sm" type="submit" disabled={busy || data.rules.length >= 20}>Add rule</Button>
      </form>
      <div><div className="flex items-center justify-between"><strong>Recent decisions</strong><Button size="sm" variant="ghost" onClick={() => void load()}>Refresh</Button></div>
        {data.decisions.length === 0 ? <p className="text-muted-foreground">No deliveries recorded.</p> : <ul className="max-h-60 space-y-2 overflow-auto">{data.decisions.map(decision => <li key={decision.id} className="border-t pt-1">
          <span className="font-medium">{decision.result === 'would_accept' ? 'Would accept' : 'Ignored'}</span> · {decision.repository || 'Unknown repository'} · {decision.sender || 'Unknown sender'} · {decision.event}/{decision.action} <span className="text-muted-foreground">· {decision.createdAt}</span>
          <p className="text-muted-foreground">{decision.reason}</p>
        </li>)}</ul>}
      </div>
    </>}
  </section>
}
