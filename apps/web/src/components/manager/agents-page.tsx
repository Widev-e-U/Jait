import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { agentsApi, type AgentThread } from '@/lib/agents-api'
import {
  newPersonaAgentDraft,
  PERSONA_AGENTS_STORAGE_KEY,
  PERSONA_AVATARS,
  readPersonaAgentDrafts,
  type PersonaAgentDraft,
  type PersonaSchedule,
} from '@/lib/persona-agents'

interface RepositoryChoice {
  id: string
  name: string
  localPath?: string
}

interface AgentsPageProps {
  repositories: RepositoryChoice[]
  availableSkills: Array<{ id: string; name?: string; title?: string }>
  threads: AgentThread[]
  onOpenThread: (id: string) => void
  onRefreshThreads: () => void
}

function agentStatus(agent: PersonaAgentDraft, threads: AgentThread[]): 'working' | 'needs attention' | 'idle' {
  const latest = threads.filter((thread) => thread.personaAgentId === agent.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  return latest?.status === 'running' ? 'working' : latest?.status === 'error' ? 'needs attention' : 'idle'
}

function AgentAvatar({ avatar }: { avatar: string }) {
  return <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 via-sky-500/10 to-violet-500/20 text-3xl ring-1 ring-border">{avatar}</span>
}

function commaList(value: string): string[] {
  return value.split(',').map((part) => part.trim()).filter(Boolean)
}

interface CommaListInputProps {
  label: string
  value: string[]
  placeholder: string
  onCommit: (value: string[]) => void
}

function CommaListInput({ label, value, placeholder, onCommit }: CommaListInputProps) {
  const [text, setText] = useState(value.join(', '))
  return (
    <label className="block text-sm font-medium">{label}
      <input
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => onCommit(commaList(text))}
        placeholder={placeholder}
      />
    </label>
  )
}

export function AgentsPage({ repositories, availableSkills, threads, onOpenThread, onRefreshThreads }: AgentsPageProps) {
  const [drafts, setDrafts] = useState<PersonaAgentDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [task, setTask] = useState('')
  const [taskRepoId, setTaskRepoId] = useState('')
  const [busy, setBusy] = useState(false)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const selected = drafts.find((agent) => agent.id === selectedId) ?? null

  useEffect(() => {
    let cancelled = false
    agentsApi.listPersonaAgents().then(async (saved) => {
      const legacy = readPersonaAgentDrafts()
      const known = new Set(saved.map((agent) => agent.id))
      const migrated: PersonaAgentDraft[] = []
      for (const agent of legacy) {
        if (!known.has(agent.id)) migrated.push(await agentsApi.savePersonaAgent(agent))
      }
      if (legacy.length) window.localStorage.removeItem(PERSONA_AGENTS_STORAGE_KEY)
      if (!cancelled) setDrafts([...saved, ...migrated])
    }).catch((error) => {
      if (!cancelled) toast.error(error instanceof Error ? error.message : 'Could not load agents')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const persist = (next: PersonaAgentDraft[]) => {
    setDrafts(next)
    const changed = next.find((agent) => {
      const previous = drafts.find((item) => item.id === agent.id)
      return !previous || previous.updatedAt !== agent.updatedAt
    })
    if (changed) {
      saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
        await agentsApi.savePersonaAgent(changed)
      }).catch((error) => { toast.error(error instanceof Error ? error.message : 'Could not save agent') })
    }
  }

  const update = (changes: Partial<PersonaAgentDraft>) => {
    if (!selected) return
    persist(drafts.map((agent) => agent.id === selected.id
      ? { ...agent, ...changes, updatedAt: new Date().toISOString() }
      : agent))
  }

  const create = () => {
    const draft = newPersonaAgentDraft()
    persist([...drafts, draft])
    setSelectedId(draft.id)
  }

  const remove = async () => {
    if (!selected) return
    try {
      await saveQueue.current
      await agentsApi.deletePersonaAgent(selected.id)
      setDrafts(drafts.filter((agent) => agent.id !== selected.id))
      setSelectedId(null)
      onRefreshThreads()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not delete agent') }
  }

  const updateSchedule = (schedule: PersonaSchedule) => update({ schedule })

  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Agents</h1>
            <p className="mt-1 text-sm text-muted-foreground">Define virtual employees and the work they may take on.</p>
          </div>
          <Button onClick={create} size="sm"><Plus className="mr-1.5 h-4 w-4" /> New agent</Button>
        </div>
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-muted-foreground">
          Agent profiles and linked tasks are saved on the server. Scheduled work and notifications are not active yet.
        </div>
        {loading && <p className="mt-6 text-sm text-muted-foreground">Loading agents…</p>}
        {!selected && <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-label="Agents">
            {!loading && drafts.length === 0 && (
              <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                No agents yet. Create one to give it a role and tasks.
              </div>
            )}
            {drafts.map((agent) => {
              const status = agentStatus(agent, threads)
              return (
              <button
                type="button"
                key={agent.id}
                onClick={() => setSelectedId(agent.id)}
                className="flex flex-col items-center rounded-2xl border bg-card px-3 py-6 text-center transition hover:border-primary/50 hover:shadow-md"
              >
                <span className="relative"><AgentAvatar avatar={agent.avatar} /><span aria-label={status} className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-[3px] border-card ${status === 'working' ? 'animate-pulse bg-emerald-500' : status === 'needs attention' ? 'bg-amber-500' : 'bg-slate-400'}`} /></span>
                <span className="mt-3 font-semibold">{agent.name || 'Untitled agent'}</span>
                <span className="mt-1 text-xs text-muted-foreground">{agent.providerId === 'claude-code' ? 'Claude Code' : agent.providerId === 'codex' ? 'Codex' : 'Jait'} · {status}</span>
              </button>
            )})}
        </div>}
          {selected ? (
            <div className="mt-5 min-w-0 space-y-5 rounded-xl border p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}><ArrowLeft className="mr-1.5 h-4 w-4" /> All agents</Button>
                <Button variant="ghost" size="sm" onClick={() => void remove()} aria-label="Delete agent"><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="flex items-center gap-4"><AgentAvatar avatar={selected.avatar} /><div><h2 className="text-lg font-semibold">{selected.name || 'Untitled agent'}</h2><p className="text-sm capitalize text-muted-foreground">{agentStatus(selected, threads)}</p></div></div>
              <fieldset><legend className="mb-2 text-sm font-medium">Avatar</legend><div className="flex flex-wrap gap-2">{PERSONA_AVATARS.map((avatar) => <button key={avatar} type="button" aria-label={`Choose ${avatar} avatar`} aria-pressed={selected.avatar === avatar} onClick={() => update({ avatar })} className={`rounded-xl p-1 ${selected.avatar === avatar ? 'ring-2 ring-primary' : ''}`}><span className="text-2xl">{avatar}</span></button>)}</div></fieldset>
              <label className="block text-sm font-medium">Name
                <input className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={selected.name} onChange={(event) => update({ name: event.target.value })} placeholder="Research assistant" />
              </label>
              <label className="block text-sm font-medium">Persona and responsibilities
                <textarea className="mt-1 min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" value={selected.persona} onChange={(event) => update({ persona: event.target.value })} placeholder="Describe how this agent should work and communicate" />
              </label>
              <label className="block text-sm font-medium">Provider<select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={selected.providerId} onChange={(event) => update({ providerId: event.target.value as PersonaAgentDraft['providerId'] })}><option value="jait">Jait</option><option value="codex">Codex</option><option value="claude-code">Claude Code</option></select></label>
              <fieldset className="space-y-2"><legend className="text-sm font-medium">Skills</legend>{availableSkills.length === 0 ? <p className="text-xs text-muted-foreground">No enabled skills available.</p> : availableSkills.map((skill) => <label key={skill.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.skillIds.includes(skill.id)} onChange={(event) => update({ skillIds: event.target.checked ? [...selected.skillIds, skill.id] : selected.skillIds.filter((id) => id !== skill.id) })} />{skill.name ?? skill.title ?? skill.id}</label>)}</fieldset>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Repositories</legend>
                {repositories.length === 0 ? <p className="text-xs text-muted-foreground">Add a repository on the Threads page first.</p> : repositories.map((repo) => (
                  <label key={repo.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selected.repositoryIds.includes(repo.id)} onChange={(event) => update({ repositoryIds: event.target.checked ? [...selected.repositoryIds, repo.id] : selected.repositoryIds.filter((id) => id !== repo.id) })} />
                    {repo.name}
                  </label>
                ))}
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">When it may work</legend>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={selected.schedule.kind} onChange={(event) => updateSchedule(event.target.value === 'cron' ? { kind: 'cron', cron: '' } : { kind: 'adaptive', rules: '' })}>
                  <option value="adaptive">Based on rules</option>
                  <option value="cron">On a schedule</option>
                </select>
                {selected.schedule.kind === 'cron'
                  ? <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" aria-label="Cron schedule" value={selected.schedule.cron} onChange={(event) => updateSchedule({ kind: 'cron', cron: event.target.value })} placeholder="0 9 * * 1-5" />
                  : <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" aria-label="Trigger rules" value={selected.schedule.rules} onChange={(event) => updateSchedule({ kind: 'adaptive', rules: event.target.value })} placeholder="Describe events that may trigger work" />}
              </fieldset>
              <CommaListInput key={`${selected.id}:tools`} label="Allowed tools" value={selected.allowedTools} onCommit={(allowedTools) => update({ allowedTools })} placeholder="Comma separated tool names" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.requiresApproval} onChange={(event) => update({ requiresApproval: event.target.checked })} /> Require approval for actions</label>
              <CommaListInput key={`${selected.id}:channels`} label="Notification channels" value={selected.notificationChannels} onCommit={(notificationChannels) => update({ notificationChannels })} placeholder="e.g. in-app, email" />
              <fieldset className="flex flex-wrap gap-4 text-sm">
                <legend className="mb-2 font-medium">Notify when</legend>
                {([['task_done', 'Task done'], ['blocked', 'Blocked'], ['question', 'Question']] as const).map(([event, label]) => (
                  <label key={event} className="flex items-center gap-2"><input type="checkbox" checked={selected.notificationEvents.includes(event)} onChange={(input) => update({ notificationEvents: input.target.checked ? [...selected.notificationEvents, event] : selected.notificationEvents.filter((item) => item !== event) })} />{label}</label>
                ))}
              </fieldset>
              <div className="border-t pt-4"><h3 className="font-semibold">New task</h3><textarea aria-label="New task" className="mt-2 min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={task} onChange={(event) => setTask(event.target.value)} placeholder="Describe the task" /><select aria-label="Task repository" className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm" value={taskRepoId} onChange={(event) => setTaskRepoId(event.target.value)}><option value="">Select repository</option>{repositories.filter((repo) => selected.repositoryIds.includes(repo.id)).map((repo) => <option key={repo.id} value={repo.id}>{repo.name}</option>)}</select><Button className="mt-2" size="sm" disabled={busy || !task.trim() || !taskRepoId} onClick={async () => { const repo = repositories.find((item) => item.id === taskRepoId); if (!repo?.localPath) return; setBusy(true); try { await saveQueue.current; const thread = await agentsApi.createThread({ personaAgentId: selected.id, title: task.trim().slice(0, 100), providerId: selected.providerId, skillIds: selected.skillIds, workingDirectory: repo.localPath }); await agentsApi.startThread(thread.id, task.trim()); setTask(''); onRefreshThreads(); onOpenThread(thread.id) } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not start task') } finally { setBusy(false) } }}>{busy ? 'Starting…' : 'Start task'}</Button></div>
              <div className="border-t pt-4"><h3 className="font-semibold">Tasks and history</h3><div className="mt-2 space-y-2">{threads.filter((thread) => thread.personaAgentId === selected.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((thread) => <button key={thread.id} type="button" onClick={() => onOpenThread(thread.id)} className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm hover:bg-muted/50"><span><span className="block font-medium">{thread.title}</span><span className="text-xs text-muted-foreground">{new Date(thread.updatedAt).toLocaleString()} · {thread.providerId} · {thread.skillIds?.join(', ') || 'No selected skills'}</span></span><span className="text-xs capitalize text-muted-foreground">{thread.status}</span></button>)}{!threads.some((thread) => thread.personaAgentId === selected.id) && <p className="text-sm text-muted-foreground">No linked tasks yet.</p>}</div><label className="mt-3 block text-xs text-muted-foreground">Link an existing thread<select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value="" onChange={async (event) => { if (!event.target.value) return; try { await agentsApi.updateThread(event.target.value, { personaAgentId: selected.id }); onRefreshThreads() } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not link thread') } }}><option value="">Select thread</option>{threads.filter((thread) => !thread.personaAgentId).map((thread) => <option key={thread.id} value={thread.id}>{thread.title}</option>)}</select></label></div>
            </div>
          ) : null}
      </div>
    </section>
  )
}
