import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar, Style } from '@dicebear/core'
import bottts from '@dicebear/styles/bottts.json' with { type: 'json' }
import { ArrowLeft, Clock3, ExternalLink, ListChecks, MessageSquare, Plus, Settings2, Sparkles, Trash2, Wrench } from 'lucide-react'
import { toast } from 'sonner'

import { ProviderModelSelector } from '@/components/chat/provider-model-selector'
import { Button } from '@/components/ui/button'
import { agentsApi, type AgentThread, type ThreadActivity } from '@/lib/agents-api'
import { getAuthToken } from '@/lib/auth-token'
import { getApiUrl } from '@/lib/gateway-url'
import { jobsApi } from '@/lib/jobs-api'
import {
  agentTaskPrompt, newPersonaAgentDraft, normalizePersonaAvatar, PERSONA_AGENTS_STORAGE_KEY,
  PERSONA_AVATARS, readPersonaAgentDrafts, type PersonaAgentDraft, type PersonaTask,
} from '@/lib/persona-agents'

type AgentTab = 'chat' | 'runs' | 'skills' | 'tools' | 'profile'
interface RepositoryChoice { id: string; name: string; localPath?: string }
interface AgentsPageProps {
  token: string | null
  repositories: RepositoryChoice[]
  availableSkills: Array<{ id: string; name?: string; title?: string }>
  threads: AgentThread[]
  onOpenThread: (id: string) => void
  onRefreshThreads: () => void
  onOpenSettings: (tab: 'skills' | 'tools') => void
}

const avatarStyle = new Style(bottts)
const avatarSources = new Map(PERSONA_AVATARS.map((seed) => [seed, new Avatar(avatarStyle, {
  seed, size: 128, borderRadius: 50,
  backgroundColor: ['#dbeafe', '#e9d5ff', '#cffafe', '#fce7f3', '#dcfce7'],
}).toDataUri()]))
function AgentAvatar({ avatar, className = 'h-16 w-16' }: { avatar: string; className?: string }) {
  return <img alt="" src={avatarSources.get(normalizePersonaAvatar(avatar))} className={`${className} shrink-0 rounded-full object-cover`} />
}

function activityText(activity: ThreadActivity): string {
  const payload = activity.payload && typeof activity.payload === 'object' ? activity.payload as Record<string, unknown> : {}
  return typeof payload.content === 'string' ? payload.content : activity.summary
}
function activityRole(activity: ThreadActivity): 'user' | 'assistant' | null {
  if (activity.kind !== 'message') return null
  const payload = activity.payload && typeof activity.payload === 'object' ? activity.payload as Record<string, unknown> : {}
  return payload.role === 'user' ? 'user' : payload.role === 'assistant' ? 'assistant' : null
}

function SkillsTable({ skills, selectedIds, onChange, onOpenStore }: {
  skills: AgentsPageProps['availableSkills']; selectedIds: string[];
  onChange: (ids: string[]) => void; onOpenStore: () => void
}) {
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => skills.filter((skill) => (skill.name ?? skill.title ?? skill.id).toLowerCase().includes(filter.toLowerCase())), [skills, filter])
  const pageCount = Math.max(1, Math.ceil(filtered.length / 8))
  const shown = filtered.slice(Math.min(page, pageCount - 1) * 8, (Math.min(page, pageCount - 1) + 1) * 8)
  return <div className="max-h-[500px] overflow-hidden rounded-lg border">
    <div className="flex items-center gap-2 border-b p-3">
      <input aria-label="Filter skills" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0) }} placeholder="Find a skill" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" />
      <Button variant="outline" size="sm" onClick={onOpenStore}>Skill store <ExternalLink className="ml-1 h-3.5 w-3.5" /></Button>
    </div>
    <div className="max-h-[360px] overflow-y-auto">
      <table className="w-full text-left text-sm"><thead className="sticky top-0 bg-muted/80"><tr><th className="px-3 py-2">Skill</th><th className="px-3 py-2 text-right">Assigned</th></tr></thead><tbody>
        {shown.map((skill) => <tr key={skill.id} className="border-t"><td className="px-3 py-2">{skill.name ?? skill.title ?? skill.id}</td><td className="px-3 py-2 text-right"><input type="checkbox" aria-label={`Assign ${skill.name ?? skill.title ?? skill.id}`} checked={selectedIds.includes(skill.id)} onChange={(event) => onChange(event.target.checked ? [...selectedIds, skill.id] : selectedIds.filter((id) => id !== skill.id))} /></td></tr>)}
        {shown.length === 0 && <tr><td colSpan={2} className="px-3 py-6 text-center text-muted-foreground">No matching skills</td></tr>}
      </tbody></table>
    </div>
    <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground"><span>{filtered.length} skills · Page {Math.min(page, pageCount - 1) + 1} of {pageCount}</span><span className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>Next</Button></span></div>
  </div>
}

export function AgentsPage({ token, repositories, availableSkills, threads, onOpenThread, onRefreshThreads, onOpenSettings }: AgentsPageProps) {
  const [agents, setAgents] = useState<PersonaAgentDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState<PersonaAgentDraft | null>(null)
  const [tab, setTab] = useState<AgentTab>('chat')
  const [busy, setBusy] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [conversationThreadId, setConversationThreadId] = useState<string | null>(null)
  const [chatActivities, setChatActivities] = useState<ThreadActivity[]>([])
  const [chatStatus, setChatStatus] = useState<string | null>(null)
  const [taskName, setTaskName] = useState('')
  const [taskPrompt, setTaskPrompt] = useState('')
  const [taskCron, setTaskCron] = useState('')
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [runRepoId, setRunRepoId] = useState('')
  const [availableTools, setAvailableTools] = useState<Array<{ name: string; description?: string; enabled: boolean }>>([])
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const selected = agents.find((agent) => agent.id === selectedId) ?? null
  const current = creating ?? selected
  const agentThreads = selected ? threads.filter((thread) => thread.personaAgentId === selected.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : []
  const activeChatThreadId = conversationThreadId ?? selected?.chatThreadId
  const discussionThread = conversationThreadId ? agentThreads.find((thread) => thread.id === conversationThreadId) : undefined

  useEffect(() => {
    if (!token) return
    let cancelled = false
    agentsApi.listPersonaAgents().then(async (saved) => {
      const legacy = readPersonaAgentDrafts()
      const known = new Set(saved.map((agent) => agent.id))
      const migrated = await Promise.all(legacy.filter((agent) => !known.has(agent.id)).map((agent) => agentsApi.savePersonaAgent(agent)))
      if (legacy.length) window.localStorage.removeItem(PERSONA_AGENTS_STORAGE_KEY)
      if (!cancelled) setAgents([...saved, ...migrated].map((agent) => ({ ...agent, avatar: normalizePersonaAvatar(agent.avatar), tasks: agent.tasks ?? [] })))
    }).catch((error) => { if (!cancelled) toast.error(error instanceof Error ? error.message : 'Could not load agents') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    if (!activeChatThreadId || tab !== 'chat') { setChatActivities([]); setChatStatus(null); return }
    let cancelled = false
    const refresh = () => {
      void agentsApi.getActivities(activeChatThreadId, 200).then((items) => { if (!cancelled) setChatActivities(items) }).catch(() => {})
      void agentsApi.getThread(activeChatThreadId).then((thread) => { if (!cancelled) setChatStatus(thread.status) }).catch(() => {})
    }
    refresh()
    const timer = window.setInterval(refresh, 3000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [activeChatThreadId, tab])

  useEffect(() => {
    if (tab !== 'tools' || !selected) return
    const token = getAuthToken()
    void fetch(`${getApiUrl()}/api/auth/settings/tools`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (response) => { if (!response.ok) throw new Error('Could not load tools'); return response.json() as Promise<{ tools: Array<{ name: string; description?: string; enabled: boolean }> }> })
      .then((data) => setAvailableTools(data.tools))
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Could not load tools'))
  }, [tab, selected?.id])

  const save = (agent: PersonaAgentDraft) => {
    setAgents((existing) => existing.map((item) => item.id === agent.id ? agent : item))
    saveQueue.current = saveQueue.current.catch(() => {}).then(async () => { await agentsApi.savePersonaAgent(agent) })
      .catch((error) => { toast.error(error instanceof Error ? error.message : 'Could not save agent') })
  }
  const syncSchedules = (agent: PersonaAgentDraft) => {
    saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
      for (const task of agent.tasks ?? []) {
        if (!task.jobId) continue
        await jobsApi.updateJob(task.jobId, {
          name: `${agent.name}: ${task.name}`, prompt: `Task: ${task.name}\n\n${agentTaskPrompt(agent, task.prompt)}`,
          provider: agent.providerId, model: agent.model ?? null,
          payload: { personaAgentId: agent.id, skillIds: agent.skillIds, runtimeMode: agent.requiresApproval ? 'supervised' : 'full-access' },
        })
      }
    }).catch((error) => { toast.error(error instanceof Error ? error.message : 'Could not update scheduled tasks') })
  }
  const change = (patch: Partial<PersonaAgentDraft>) => {
    if (!current) return
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
    if (creating) setCreating(next)
    else {
      save(next)
      if (patch.providerId !== undefined || patch.model !== undefined || patch.skillIds !== undefined || patch.requiresApproval !== undefined) syncSchedules(next)
    }
  }
  const create = async () => {
    if (!creating?.name.trim()) return
    setBusy(true)
    try {
      const agent = { ...creating, name: creating.name.trim(), updatedAt: new Date().toISOString() }
      await agentsApi.savePersonaAgent(agent)
      setAgents((existing) => [...existing, agent])
      setCreating(null); setSelectedId(agent.id); setTab('chat')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not create agent') }
    finally { setBusy(false) }
  }
  const remove = async () => {
    if (!selected) return
    setBusy(true)
    try {
      await saveQueue.current
      for (const task of selected.tasks ?? []) if (task.jobId) await jobsApi.deleteJob(task.jobId)
      await agentsApi.deletePersonaAgent(selected.id)
      setAgents((existing) => existing.filter((agent) => agent.id !== selected.id))
      setSelectedId(null); onRefreshThreads()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not delete agent') }
    finally { setBusy(false) }
  }
  const startRun = async (agent: PersonaAgentDraft, prompt: string, isChat: boolean, taskName?: string) => {
    const repo = repositories.find((item) => item.id === runRepoId)
    const thread = await agentsApi.createThread({
      personaAgentId: agent.id, title: isChat ? `Chat with ${agent.name}` : taskName ?? prompt.slice(0, 100),
      providerId: agent.providerId, model: agent.model ?? undefined, skillIds: agent.skillIds,
      runtimeMode: agent.requiresApproval ? 'supervised' : 'full-access',
      workingDirectory: repo?.localPath,
    })
    await agentsApi.startThread(thread.id, { message: agentTaskPrompt(agent, prompt), displayContent: prompt })
    onRefreshThreads()
    return thread
  }
  const askAgent = async () => {
    if (!selected || !chatInput.trim() || busy) return
    const message = chatInput.trim()
    setBusy(true)
    try {
      await saveQueue.current
      if (activeChatThreadId) {
        const thread = await agentsApi.getThread(activeChatThreadId)
        if (thread.providerSessionId) await agentsApi.sendTurn(activeChatThreadId, message)
        else await agentsApi.startThread(activeChatThreadId, { message: agentTaskPrompt(selected, message), displayContent: message })
      }
      else {
        const thread = await startRun(selected, message, true)
        save({ ...selected, chatThreadId: thread.id, updatedAt: new Date().toISOString() })
      }
      setChatInput('')
      if (activeChatThreadId) setChatActivities(await agentsApi.getActivities(activeChatThreadId, 200))
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not message agent') }
    finally { setBusy(false) }
  }
  const clearTaskForm = () => { setTaskName(''); setTaskPrompt(''); setTaskCron(''); setEditingTaskId(null) }
  const saveTask = async () => {
    if (!selected || !taskName.trim() || !taskPrompt.trim()) return
    setBusy(true)
    try {
      await saveQueue.current
      const previous = (selected.tasks ?? []).find((task) => task.id === editingTaskId)
      const next: PersonaTask = { id: previous?.id ?? crypto.randomUUID(), name: taskName.trim(), prompt: taskPrompt.trim(), cron: taskCron.trim() }
      const nextAgent = { ...selected, tasks: [...(selected.tasks ?? []).filter((task) => task.id !== previous?.id), next], updatedAt: new Date().toISOString() }
      const jobData = {
        name: `${selected.name}: ${next.name}`, cron_expression: next.cron, job_type: 'agent_task' as const,
        prompt: `Task: ${next.name}\n\n${agentTaskPrompt(nextAgent, next.prompt)}`, provider: selected.providerId,
        model: selected.model ?? undefined, enabled: !selected.paused,
        payload: { personaAgentId: selected.id, skillIds: selected.skillIds, runtimeMode: selected.requiresApproval ? 'supervised' : 'full-access' },
      }
      if (next.cron) {
        const job = previous?.jobId ? await jobsApi.updateJob(previous.jobId, jobData) : await jobsApi.createJob(jobData)
        next.jobId = job.id
      } else if (previous?.jobId) await jobsApi.deleteJob(previous.jobId)
      save(nextAgent)
      clearTaskForm()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save task') }
    finally { setBusy(false) }
  }
  const deleteTask = async (task: PersonaTask) => {
    if (!selected) return
    setBusy(true)
    try {
      if (task.jobId) await jobsApi.deleteJob(task.jobId)
      save({ ...selected, tasks: (selected.tasks ?? []).filter((item) => item.id !== task.id), updatedAt: new Date().toISOString() })
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not delete task') }
    finally { setBusy(false) }
  }
  const runTask = async (task: PersonaTask) => {
    if (!selected) return
    setBusy(true)
    try { await saveQueue.current; await startRun(selected, task.prompt, false, task.name); setTab('runs') }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not run task') }
    finally { setBusy(false) }
  }
  const setPaused = async (paused: boolean) => {
    if (!selected) return
    setBusy(true)
    try {
      for (const task of selected.tasks ?? []) if (task.jobId) await jobsApi.updateJob(task.jobId, { enabled: !paused })
      save({ ...selected, paused, updatedAt: new Date().toISOString() })
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not change schedule') }
    finally { setBusy(false) }
  }

  return <section className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-6 sm:px-6">
    <div className="mx-auto max-w-6xl">
      {!current && <>
        <div className="flex items-start justify-between gap-3"><div><h1 className="text-xl font-semibold">Agents</h1><p className="mt-1 text-sm text-muted-foreground">People you can ask, assign work to, and schedule.</p></div><Button size="sm" onClick={() => setCreating(newPersonaAgentDraft())}><Plus className="mr-1 h-4 w-4" /> New agent</Button></div>
        {loading && <p className="mt-6 text-sm text-muted-foreground">Loading agents…</p>}
        {!loading && agents.length === 0 && <p className="mt-10 text-center text-sm text-muted-foreground">Create an agent to start a conversation or schedule work.</p>}
        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">{agents.map((agent) => {
          const latest = threads.filter((thread) => thread.personaAgentId === agent.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
          return <button key={agent.id} type="button" onClick={() => { setSelectedId(agent.id); setConversationThreadId(null); setTab('chat') }} className="flex flex-col items-center rounded-xl border p-5 text-center hover:bg-muted/50"><AgentAvatar avatar={agent.avatar} className="h-20 w-20" /><strong className="mt-3">{agent.name || 'Untitled agent'}</strong><span className="mt-1 text-xs capitalize text-muted-foreground">{latest?.status === 'running' ? 'Working' : latest?.status === 'error' ? 'Needs attention' : 'Ready'}</span></button>
        })}</div>
      </>}
      {current && <>
        <div className="flex items-center justify-between"><Button variant="ghost" size="sm" onClick={() => { setCreating(null); setSelectedId(null); setConversationThreadId(null) }}><ArrowLeft className="mr-1 h-4 w-4" /> All agents</Button>{selected && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove()} aria-label="Delete agent"><Trash2 className="h-4 w-4" /></Button>}</div>
        <div className="mt-4 flex items-center gap-4"><AgentAvatar avatar={current.avatar} /><div><h1 className="text-xl font-semibold">{creating ? 'Create agent' : current.name}</h1><p className="text-sm text-muted-foreground">{creating ? 'Set up your virtual employee' : current.persona || 'Ask about their work or assign a task'}</p></div></div>
        {creating ? <div className="mt-6 max-w-2xl space-y-5 rounded-xl border p-5">
          <label className="block text-sm font-medium">Name<input value={current.name} onChange={(event) => change({ name: event.target.value })} placeholder="Research assistant" className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label>
          <label className="block text-sm font-medium">Role and responsibilities<textarea value={current.persona} onChange={(event) => change({ persona: event.target.value })} placeholder="Research topics, create concise reports, and explain findings" className="mt-1 min-h-28 w-full rounded-md border bg-background px-3 py-2" /></label>
          <div><span className="mb-2 block text-sm font-medium">Provider and model</span><ProviderModelSelector provider={current.providerId} model={current.model ?? null} onProviderChange={(providerId) => change({ providerId, model: null })} onModelChange={(model) => change({ model })} tooltipSide="bottom" /></div>
          <fieldset><legend className="mb-2 text-sm font-medium">Avatar</legend><div className="flex flex-wrap gap-2">{PERSONA_AVATARS.map((avatar) => <button type="button" key={avatar} aria-label={`Choose ${avatar} avatar`} aria-pressed={current.avatar === avatar} onClick={() => change({ avatar })} className={`rounded-full p-1 ${current.avatar === avatar ? 'ring-2 ring-primary' : ''}`}><AgentAvatar avatar={avatar} className="h-11 w-11" /></button>)}</div></fieldset>
          <SkillsTable skills={availableSkills} selectedIds={current.skillIds} onChange={(skillIds) => change({ skillIds })} onOpenStore={() => onOpenSettings('skills')} />
          <Button disabled={busy || !current.name.trim()} onClick={() => void create()}>{busy ? 'Creating…' : 'Create agent'}</Button>
        </div> : <div className="mt-6 flex min-h-[500px] flex-col gap-5 md:flex-row">
          <aside aria-label="Agent sections" className="flex shrink-0 gap-1 overflow-x-auto md:w-44 md:flex-col">
            {([['chat', 'Chat', MessageSquare], ['runs', 'Tasks & runs', ListChecks], ['skills', 'Skills', Sparkles], ['tools', 'Tools', Wrench], ['profile', 'Profile', Settings2]] as const).map(([id, label, Icon]) => <Button key={id} variant={tab === id ? 'secondary' : 'ghost'} size="sm" className="shrink-0 justify-start" onClick={() => setTab(id)}><Icon className="mr-2 h-4 w-4" />{label}</Button>)}
          </aside>
          <div className="min-w-0 flex-1 rounded-xl border p-4 sm:p-5">
            {tab === 'chat' && <div className="flex min-h-[440px] flex-col"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{discussionThread ? `Discuss ${discussionThread.title}` : `Ask ${selected!.name}`}</h2><p className="text-sm text-muted-foreground">Discuss completed work, ask what they think, or give a new instruction.</p></div>{discussionThread && <Button variant="outline" size="sm" onClick={() => setConversationThreadId(null)}>Main chat</Button>}</div>
              <div className="mt-5 flex-1 space-y-3">{chatActivities.filter((activity) => activityRole(activity)).reverse().map((activity) => <div key={activity.id} className={`max-w-[90%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap ${activityRole(activity) === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted'}`}>{activityText(activity)}</div>)}{!chatActivities.length && <p className="py-16 text-center text-sm text-muted-foreground">Start by asking a question or giving an instruction.</p>}{chatStatus === 'running' && <p className="text-sm text-muted-foreground">Working…</p>}</div>
              <div className="mt-5 border-t pt-4"><textarea aria-label="Message agent" value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void askAgent() } }} placeholder={`Ask ${selected!.name}…`} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" /><div className="mt-2 flex justify-end"><Button disabled={busy || !chatInput.trim() || chatStatus === 'running'} onClick={() => void askAgent()}>{busy ? 'Sending…' : 'Send'}</Button></div></div>
            </div>}
            {tab === 'runs' && <div className="space-y-6"><div><h2 className="font-semibold">Tasks & runs</h2><p className="text-sm text-muted-foreground">Each task is a skill this agent can use. Add a timer to run it automatically.</p></div>
              <div className="rounded-lg border p-4"><h3 className="font-medium">{editingTaskId ? 'Edit task' : 'New task'}</h3><div className="mt-3 grid gap-3"><input aria-label="Task name" value={taskName} onChange={(event) => setTaskName(event.target.value)} placeholder="Weekly research report" className="rounded-md border bg-background px-3 py-2 text-sm" /><textarea aria-label="Task instructions" value={taskPrompt} onChange={(event) => setTaskPrompt(event.target.value)} placeholder="Research the latest updates and write a report" className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm" /><label className="text-sm">Cron schedule (optional)<input aria-label="Task cron schedule" value={taskCron} onChange={(event) => setTaskCron(event.target.value)} placeholder="0 9 * * 1" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" /></label></div><div className="mt-3 flex gap-2"><Button size="sm" disabled={busy || !taskName.trim() || !taskPrompt.trim()} onClick={() => void saveTask()}>{editingTaskId ? 'Save task' : 'Add task'}</Button>{editingTaskId && <Button size="sm" variant="ghost" onClick={clearTaskForm}>Cancel</Button>}</div></div>
              <div className="space-y-2">{(selected!.tasks ?? []).map((task) => <div key={task.id} className="rounded-lg border p-3"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm">{task.name}</strong><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{task.prompt}</p>{task.cron && <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" />{task.cron}{selected!.paused ? ' · Paused' : ' · Active'}</span>}</div><Button size="sm" variant="ghost" disabled={busy} onClick={() => void deleteTask(task)} aria-label={`Delete ${task.name}`}><Trash2 className="h-4 w-4" /></Button></div><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void runTask(task)}>Run now</Button><Button size="sm" variant="ghost" onClick={() => { setTaskName(task.name); setTaskPrompt(task.prompt); setTaskCron(task.cron); setEditingTaskId(task.id) }}>Edit</Button></div></div>)}{!(selected!.tasks ?? []).length && <p className="text-sm text-muted-foreground">No tasks yet.</p>}</div>
              <label className="block text-sm">Repository for manual runs<select aria-label="Run repository" value={runRepoId} onChange={(event) => setRunRepoId(event.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"><option value="">No repository</option>{repositories.map((repo) => <option key={repo.id} value={repo.id}>{repo.name}</option>)}</select></label>
              <div className="border-t pt-4"><h3 className="font-medium">Run history</h3><div className="mt-2 space-y-2">{agentThreads.filter((thread) => thread.id !== selected!.chatThreadId).map((thread) => <div key={thread.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"><span>{thread.title}<span className="ml-2 text-xs text-muted-foreground">{new Date(thread.updatedAt).toLocaleString()} · {thread.status}</span></span><span className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setConversationThreadId(thread.id); setTab('chat') }}>Discuss run</Button><Button size="sm" variant="ghost" onClick={() => onOpenThread(thread.id)}>Details</Button></span></div>)}{!agentThreads.some((thread) => thread.id !== selected!.chatThreadId) && <p className="text-sm text-muted-foreground">No runs yet.</p>}</div></div>
            </div>}
            {tab === 'skills' && <div className="space-y-5"><div><h2 className="font-semibold">Skills</h2><p className="text-sm text-muted-foreground">Assigned tasks are skills for this agent. Installed skills provide more ways to work.</p></div>{(selected!.tasks ?? []).map((task) => <div key={task.id} className="rounded-lg border px-3 py-2 text-sm"><strong>{task.name}</strong><p className="text-muted-foreground">{task.prompt}</p></div>)}<SkillsTable skills={availableSkills} selectedIds={selected!.skillIds} onChange={(skillIds) => change({ skillIds })} onOpenStore={() => onOpenSettings('skills')} /></div>}
            {tab === 'tools' && <div className="space-y-4"><h2 className="font-semibold">Tools</h2><p className="text-sm text-muted-foreground">Enabled tools available to your account. The provider may have its own tool capabilities.</p><div className="max-h-[500px] overflow-y-auto rounded-lg border">{availableTools.filter((tool) => tool.enabled).map((tool) => <div key={tool.name} className="border-b px-3 py-2 text-sm"><strong>{tool.name}</strong>{tool.description && <p className="text-xs text-muted-foreground">{tool.description}</p>}</div>)}{!availableTools.some((tool) => tool.enabled) && <p className="p-3 text-sm text-muted-foreground">No enabled tools found.</p>}</div><Button variant="outline" onClick={() => onOpenSettings('tools')}>Open tool settings <ExternalLink className="ml-2 h-4 w-4" /></Button></div>}
            {tab === 'profile' && <div className="max-w-2xl space-y-5"><h2 className="font-semibold">Profile</h2><label className="block text-sm font-medium">Name<input value={selected!.name} onChange={(event) => change({ name: event.target.value })} onBlur={() => syncSchedules(selected!)} className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label><label className="block text-sm font-medium">Role and responsibilities<textarea value={selected!.persona} onChange={(event) => change({ persona: event.target.value })} onBlur={() => syncSchedules(selected!)} className="mt-1 min-h-28 w-full rounded-md border bg-background px-3 py-2" /></label><div><span className="mb-2 block text-sm font-medium">Provider and model</span><ProviderModelSelector provider={selected!.providerId} model={selected!.model ?? null} onProviderChange={(providerId) => change({ providerId, model: null })} onModelChange={(model) => change({ model })} tooltipSide="bottom" /></div><fieldset><legend className="mb-2 text-sm font-medium">Avatar</legend><div className="flex flex-wrap gap-2">{PERSONA_AVATARS.map((avatar) => <button type="button" key={avatar} aria-label={`Choose ${avatar} avatar`} aria-pressed={selected!.avatar === avatar} onClick={() => change({ avatar })} className={`rounded-full p-1 ${selected!.avatar === avatar ? 'ring-2 ring-primary' : ''}`}><AgentAvatar avatar={avatar} className="h-11 w-11" /></button>)}</div></fieldset><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected!.requiresApproval} onChange={(event) => change({ requiresApproval: event.target.checked })} />Require approval for actions</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!selected!.paused} disabled={busy} onChange={(event) => void setPaused(!event.target.checked)} />Enable scheduled tasks</label></div>}
          </div>
        </div>}
      </>}
    </div>
  </section>
}
