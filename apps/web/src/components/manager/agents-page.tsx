import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { TeamRoom } from '@jait/shared'
import { teamChatApi } from '@/lib/team-chat-api'
import { TeamRoomView } from './team-room'
import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ArrowLeft, Clock3, ExternalLink, ListChecks, Maximize2, Play, MessageSquare, Minimize2, Plus, Settings2, Sparkles, Trash2, UsersRound, Wrench } from 'lucide-react'
import { toast } from 'sonner'

import { Conversation, Message, PromptInput } from '@/components/chat'
import type { PromptSkill, ReferencedFile } from '@/components/chat'
import { ProviderModelSelector } from '@/components/chat/provider-model-selector'
import { AgentAvatar } from './agent-avatar'
import { TeamAvatar } from './team-avatar'
import { AgentRow } from './agent-row'
import { agentContinuation } from '@/lib/agent-continuation'
import { AgentsGraph } from './agents-graph'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { agentsApi, type AgentThread, type ThreadActivity } from '@/lib/agents-api'
import { useChat, type ChatAttachment } from '@/hooks/useChat'
import { activitiesToMessages } from '@/lib/activity-to-messages'
import { mergeAttachmentsIntoSegments } from '@/lib/message-segment-builders'
import { appendUploadedAttachmentPromptBlock, getUploadedAttachmentDisplayLabel } from '@/lib/uploaded-attachment-prompt'
import { userMessageTextFromSegments, type UserMessageSegment } from '@/lib/user-message-segments'
import { getAuthToken } from '@/lib/auth-token'
import { getApiUrl } from '@/lib/gateway-url'
import { jobsApi } from '@/lib/jobs-api'
import { availableManagers, organizationEntries, teamMembers } from '@/lib/agent-organization'
import {
  agentTaskPrompt, newPersonaAgentDraft, normalizePersonaAvatar, PERSONA_AGENTS_STORAGE_KEY,
  PERSONA_AVATARS, readPersonaAgentDrafts, type PersonaAgentDraft, type PersonaTask,
} from '@/lib/persona-agents'

type AgentTab = 'chat' | 'runs' | 'skills' | 'tools' | 'profile'
const AGENT_VIEW_KEY = 'jait.agents.activeView'
interface RepositoryChoice { id: string; name: string; localPath?: string }
interface AgentsPageProps {
  token: string | null
  repositories: RepositoryChoice[]
  availableSkills: PromptSkill[]
  threads: AgentThread[]
  onOpenThread: (id: string) => void
  onRefreshThreads: () => void
  onOpenSettings: (tab: 'skills' | 'tools') => void
  onRefreshSkills: () => void
}

function SkillsTable({ skills, selectedIds, onChange, onOpenStore }: {
  skills: AgentsPageProps['availableSkills']; selectedIds: string[];
  onChange: (ids: string[]) => void; onOpenStore: () => void
}) {
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => skills.filter((skill) => (skill.name || skill.id).toLowerCase().includes(filter.toLowerCase())), [skills, filter])
  const pageCount = Math.max(1, Math.ceil(filtered.length / 8))
  const shown = filtered.slice(Math.min(page, pageCount - 1) * 8, (Math.min(page, pageCount - 1) + 1) * 8)
  return <div className="max-h-[500px] overflow-hidden rounded-lg border">
    <div className="flex flex-wrap items-center gap-2 border-b p-3">
      <p className="w-full text-xs text-muted-foreground">Available skills are selected for new agents. Adjust only if this agent needs fewer.</p>
      <input aria-label="Filter skills" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0) }} placeholder="Find a skill" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" />
      <Button variant="ghost" size="sm" onClick={() => onChange(skills.map((skill) => skill.id))}>Select all</Button>
      <Button variant="outline" size="sm" onClick={onOpenStore}>Browse skill store <ExternalLink className="ml-1 h-3.5 w-3.5" /></Button>
    </div>
    <div className="max-h-[360px] overflow-y-auto">
      <table className="w-full text-left text-sm"><thead className="sticky top-0 bg-muted/80"><tr><th className="px-3 py-2">Skill</th><th className="px-3 py-2 text-right">Use</th></tr></thead><tbody>
        {shown.map((skill) => <tr key={skill.id} className="border-t"><td className="px-3 py-2">{skill.name || skill.id}</td><td className="px-3 py-2 text-right"><input type="checkbox" aria-label={`Assign ${skill.name || skill.id}`} checked={selectedIds.includes(skill.id)} onChange={(event) => onChange(event.target.checked ? [...selectedIds, skill.id] : selectedIds.filter((id) => id !== skill.id))} /></td></tr>)}
        {shown.length === 0 && <tr><td colSpan={2} className="px-3 py-6 text-center text-muted-foreground">No matching skills</td></tr>}
      </tbody></table>
    </div>
    <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground"><span>{filtered.length} skills · Page {Math.min(page, pageCount - 1) + 1} of {pageCount}</span><span className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>Next</Button></span></div>
  </div>
}

export function AgentsPage({ token, repositories, availableSkills, threads, onOpenThread, onRefreshThreads, onOpenSettings, onRefreshSkills }: AgentsPageProps) {
  const [agents, setAgents] = useState<PersonaAgentDraft[]>([])
  const providerSaveRevision = useRef(0)
  const providerSavePending = useRef(0)
  const agentsRef = useRef(agents)
  agentsRef.current = agents
  const [organizationView, setOrganizationView] = useState<'list' | 'graph'>('graph')
  const [teamRoomId, setTeamRoomId] = useState<string | null>(() => typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('teamRoom'))
  const [teamRooms, setTeamRooms] = useState<TeamRoom[]>([])
  const initialRoomChosen = useRef(false)
  const [teamRuntime, setTeamRuntime] = useState<{ roomId: string; runningIds: ReadonlySet<string> } | null>(null)
  const teamDrafts = useRef(new Map<string, string>())
  useEffect(() => { teamDrafts.current.clear() }, [token])
  const openTeamRoom = (id: string | null) => {
    if (id) { setSelectedId(null); setCreating(null); setChatFullscreen(false) }
    setTeamRoomId(id)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('teamRoom', id)
    else url.searchParams.delete('teamRoom')
    window.history.replaceState(window.history.state, '', url)
  }
  useEffect(() => {
    let active = true
    teamChatApi.list().then(result => {
      if (!active) return
      setTeamRooms(result.rooms)
      if (!initialRoomChosen.current) {
        initialRoomChosen.current = true
        if (window.innerWidth >= 640 && !selectedId) setTeamRoomId(id => id ?? result.rooms[0]?.id ?? null)
      }
    }).catch(() => {})
    return () => { active = false }
  }, [agents.map(agent => agent.id).join(",")])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try { return JSON.parse(window.sessionStorage.getItem(AGENT_VIEW_KEY) ?? 'null')?.id ?? null } catch { return null }
  })
  const [creating, setCreating] = useState<PersonaAgentDraft | null>(null)
  const [tab, setTab] = useState<AgentTab>(() => {
    if (typeof window === 'undefined') return 'chat'
    try {
      const tab = JSON.parse(window.sessionStorage.getItem(AGENT_VIEW_KEY) ?? 'null')?.tab
      return ['chat', 'runs', 'skills', 'tools', 'profile'].includes(tab) ? tab : 'chat'
    } catch { return 'chat' }
  })
  const [busy, setBusy] = useState(false)
  const [resuming, setResuming] = useState(false)
  const resumePending = useRef(new Set<string>())
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteName, setDeleteName] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [chatInputVersion, setChatInputVersion] = useState(0)
  const [builderMode, setBuilderMode] = useState<'skill' | 'task' | null>(null)
  const [chatFullscreen, setChatFullscreen] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
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
  const skillIdsFor = (agent: PersonaAgentDraft) => (agent.usesAllSkills ?? agent.skillIds.length === 0) ? availableSkills.map((skill) => skill.id) : agent.skillIds
  const agentThreads = selected ? threads.filter((thread) => thread.personaAgentId === selected.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : []
  const activeChatThreadId = conversationThreadId ?? (selected?.chatSessionId ? null : selected?.chatThreadId) ?? null
  const activeChatSessionId = conversationThreadId ? null : selected?.chatSessionId ?? null
  const sessionChat = useChat(activeChatSessionId, token)
  const discussionThread = conversationThreadId ? agentThreads.find((thread) => thread.id === conversationThreadId) : undefined
  const legacyMessages = useMemo(() => activitiesToMessages([...chatActivities].sort((a, b) => a.createdAt.localeCompare(b.createdAt))), [chatActivities])
  const chatMessages = activeChatSessionId ? sessionChat.messages : legacyMessages
  const latestAssistant = [...chatMessages].reverse().find((message) => message.role === 'assistant' && message.content.trim())
  const activeChatStatus = activeChatSessionId ? (sessionChat.isLoading ? 'running' : 'idle') : chatStatus ?? agentThreads.find((thread) => thread.id === activeChatThreadId)?.status ?? null

  useEffect(() => {
    if (typeof window !== 'undefined') window.sessionStorage.setItem(AGENT_VIEW_KEY, JSON.stringify({ id: selectedId, tab }))
  }, [selectedId, tab])

  useEffect(() => { if (token) onRefreshSkills() }, [token, onRefreshSkills])

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
    if (!chatFullscreen) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setChatFullscreen(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [chatFullscreen])

  useEffect(() => {
    if (!activeChatThreadId || tab !== 'chat') { setChatActivities([]); setChatStatus(null); setChatLoading(false); return }
    let cancelled = false
    setChatActivities([])
    setChatStatus(null)
    setChatLoading(true)
    const refresh = () => {
      void agentsApi.getActivities(activeChatThreadId).then((items) => { if (!cancelled) setChatActivities(items) }).catch(() => {}).finally(() => { if (!cancelled) setChatLoading(false) })
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

  useEffect(() => {
    if (!token || loading || creating) return
    let active = true
    const timer = window.setInterval(() => {
      if (providerSavePending.current) return
      const revision = providerSaveRevision.current
      void agentsApi.listPersonaAgents().then(saved => {
        if (active && revision === providerSaveRevision.current && !providerSavePending.current) setAgents(saved.map(agent => ({ ...agent, avatar: normalizePersonaAvatar(agent.avatar), tasks: agent.tasks ?? [] })))
      }).catch(() => {
        if (active && revision === providerSaveRevision.current && !providerSavePending.current) setAgents(existing => existing.map(agent => ({ ...agent, activeTasks: null, liveState: null })))
      })
    }, 3000)
    return () => { active = false; window.clearInterval(timer) }
  }, [token, loading, creating?.id])

  const saveProvider = (id: string, provider: string, model: string | null): Promise<void> => {
    providerSavePending.current += 1
    providerSaveRevision.current += 1
    const operation = saveQueue.current.catch(() => {}).then(async () => {
      // Read after prior saves finish, so editing a row does not overwrite newer profile fields.
      const agent = agentsRef.current.find(item => item.id === id)
      if (!agent) throw new Error('Agent no longer exists')
      const saved = await agentsApi.savePersonaAgent({ ...agent, providerId: provider, model, updatedAt: new Date().toISOString() })
      agentsRef.current = agentsRef.current.map(item => item.id === id ? saved : item)
      setAgents(agentsRef.current)
      try {
        for (const task of saved.tasks ?? []) {
          if (!task.jobId) continue
          await jobsApi.updateJob(task.jobId, {
            name: `${saved.name}: ${task.name}`, prompt: `Task: ${task.name}\n\n${agentTaskPrompt(saved, task.prompt, agentsRef.current)}`,
            provider: saved.providerId, model: saved.model ?? null,
            payload: { personaAgentId: saved.id, skillIds: skillIdsFor(saved), runtimeMode: saved.requiresApproval ? 'supervised' : 'full-access' },
          })
        }
      } catch (error) { throw new Error('Agent saved, but scheduled tasks could not be updated: ' + (error instanceof Error ? error.message : 'Try again')) }
    })
    void operation.finally(() => { providerSavePending.current -= 1; providerSaveRevision.current += 1 }).catch(() => {})
    saveQueue.current = operation.catch(() => {})
    return operation
  }

  const resumeWork = async (threadId: string) => {
    if (resumePending.current.has(threadId)) return
    resumePending.current.add(threadId)
    try {
      await saveQueue.current
      await agentsApi.resumeThread(threadId)
    } finally { resumePending.current.delete(threadId); onRefreshThreads() }
  }
  const interruptedAgents = agents.flatMap(agent => {
    const thread = agentContinuation(agent, threads)
    return thread ? [{ agent, thread }] : []
  })
  const resumeInterrupted = async () => {
    setResuming(true)
    const failures: string[] = []
    try {
      await saveQueue.current
      for (const { agent, thread } of interruptedAgents) {
        try { await resumeWork(thread.id) }
        catch (error) { failures.push(`${agent.name}: ${error instanceof Error ? error.message : 'Could not resume'}`) }
      }
      if (failures.length) toast.error(failures.join('\n'))
      else toast.success('Interrupted agents continued')
    } finally { setResuming(false) }
  }

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
          name: `${agent.name}: ${task.name}`, prompt: `Task: ${task.name}\n\n${agentTaskPrompt(agent, task.prompt, agents)}`,
          provider: agent.providerId, model: agent.model ?? null,
          payload: { personaAgentId: agent.id, skillIds: skillIdsFor(agent), runtimeMode: agent.requiresApproval ? 'supervised' : 'full-access' },
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
      if (patch.providerId !== undefined || patch.model !== undefined || patch.skillIds !== undefined || patch.requiresApproval !== undefined || patch.role !== undefined || patch.reportsToId !== undefined) syncSchedules(next)
    }
  }
  const prepareBuilderChat = (kind: 'skill' | 'task') => {
    setBuilderMode(kind)
    setConversationThreadId(null)
    setTab('chat')
    setChatInput(kind === 'skill'
      ? `Help me create a reusable skill for ${selected?.name}. Ask what I need it to do, which tools or sources it should use, and when to use it. Then create or import the skill, and help me test it.`
      : `Help me set up a task for ${selected?.name}. Ask what outcome I want, which skills it needs, and whether it should run on a schedule. Help me turn it into clear instructions and save it as a task.`)
    setChatInputVersion((version) => version + 1)
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
      setAgents((existing) => existing.filter((agent) => agent.id !== selected.id).map((agent) => agent.reportsToId === selected.id ? { ...agent, reportsToId: null } : agent))
      setSelectedId(null); setDeleteOpen(false); setDeleteName(''); onRefreshThreads()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not delete agent') }
    finally { setBusy(false) }
  }
  const startRun = async (agent: PersonaAgentDraft, prompt: string, taskName?: string) => {
    const repo = repositories.find((item) => item.id === runRepoId)
    const thread = await agentsApi.createThread({
      personaAgentId: agent.id, title: taskName ?? prompt.slice(0, 100),
      providerId: agent.providerId, model: agent.model ?? undefined, skillIds: skillIdsFor(agent),
      runtimeMode: agent.requiresApproval ? 'supervised' : 'full-access',
      workingDirectory: repo?.localPath,
    })
    await agentsApi.startThread(thread.id, { message: agentTaskPrompt(agent, prompt, agents), displayContent: prompt })
    onRefreshThreads()
    return thread
  }
  const askAgent = async (_chipFiles?: ReferencedFile[], attachments?: ChatAttachment[], segments?: UserMessageSegment[]) => {
    if (!selected || busy || activeChatStatus === 'running') return
    const message = (segments?.length ? userMessageTextFromSegments(segments) : chatInput).trim()
    const prompt = appendUploadedAttachmentPromptBlock(message, attachments) || (attachments?.length ? 'Please review the attached file.' : '')
    if (!prompt) return
    const displayContent = message || getUploadedAttachmentDisplayLabel(attachments)
    const displaySegments = mergeAttachmentsIntoSegments(segments, attachments)
    setBusy(true)
    try {
      await saveQueue.current
      if (!conversationThreadId && (activeChatSessionId || !selected.chatThreadId)) {
        let sessionId = activeChatSessionId
        if (!sessionId) {
          const response = await fetch(`${getApiUrl()}/api/sessions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ name: `Chat with ${selected.name}` }),
          })
          if (!response.ok) throw new Error('Could not create agent chat')
          sessionId = (await response.json() as { id: string }).id
          const createdId: string = sessionId
          // Commit the new session before sending so useChat attaches its event stream.
          flushSync(() => save({ ...selected, chatSessionId: createdId, updatedAt: new Date().toISOString() }))
        }
        const result = await sessionChat.sendMessage(activeChatSessionId && sessionChat.messages.length > 0 ? message : agentTaskPrompt(selected, message, agents), {
          sessionId, personaAgentId: selected.id, mode: 'agent', provider: selected.providerId,
          model: selected.model, runtimeMode: selected.requiresApproval ? 'supervised' : 'full-access',
          displayContent, displaySegments: displaySegments?.length ? displaySegments : [{ type: 'text', text: displayContent }],
          attachments,
        })
        if (result === 'retry') throw new Error('Could not message agent')
      } else if (activeChatThreadId) {
        const thread = await agentsApi.getThread(activeChatThreadId)
        if (thread.providerSessionId) await agentsApi.sendTurn(activeChatThreadId, { message: prompt, displayContent, displaySegments })
        else await agentsApi.startThread(activeChatThreadId, { message: agentTaskPrompt(selected, prompt, agents), displayContent, displaySegments })
        setChatActivities(await agentsApi.getActivities(activeChatThreadId))
      }
      if (!activeChatSessionId) setChatStatus('running')
    } catch (error) {
      setChatInput(message)
      setChatInputVersion((version) => version + 1)
      toast.error(error instanceof Error ? error.message : 'Could not message agent')
    } finally { setBusy(false) }
  }
  const stopAgent = async () => {
    if (activeChatSessionId) { await sessionChat.cancelRequest(); return }
    if (!activeChatThreadId) return
    try { await agentsApi.stopThread(activeChatThreadId); setChatStatus('stopped') }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not stop agent') }
  }
  const startNewChat = (patch: Partial<PersonaAgentDraft> = {}) => {
    if (!selected) return
    const next = { ...selected, ...patch, chatThreadId: undefined, chatSessionId: undefined, legacyChatThreadIds: selected.chatThreadId ? [...(selected.legacyChatThreadIds ?? []), selected.chatThreadId] : selected.legacyChatThreadIds, updatedAt: new Date().toISOString() }
    save(next)
    if (patch.providerId !== undefined || patch.model !== undefined) syncSchedules(next)
    setConversationThreadId(null)
    setChatActivities([])
    setChatStatus(null)
    setChatInput('')
    setChatInputVersion((version) => version + 1)
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
        prompt: `Task: ${next.name}\n\n${agentTaskPrompt(nextAgent, next.prompt, agents)}`, provider: selected.providerId,
        model: selected.model ?? undefined, enabled: !selected.paused,
        payload: { personaAgentId: selected.id, skillIds: skillIdsFor(selected), runtimeMode: selected.requiresApproval ? 'supervised' : 'full-access' },
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
    try { await saveQueue.current; await startRun(selected, task.prompt, task.name); setTab('runs') }
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

  return <section className={`${chatFullscreen && selected && tab === 'chat' ? 'fixed inset-0 z-50' : 'min-h-0 flex-1'} relative flex min-w-0 flex-col overflow-hidden bg-background`}>
    <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3">
      <h1 className="flex items-center gap-2 text-base font-semibold"><UsersRound className="h-4 w-4 text-muted-foreground" />Agents</h1>
      <span className="hidden text-xs text-muted-foreground sm:inline">{agents.length} people</span>
      <div className="ml-auto flex items-center gap-1">
        <Button size="sm" variant={organizationView === 'graph' ? 'secondary' : 'ghost'} aria-pressed={organizationView === 'graph'} onClick={() => { setOrganizationView('graph'); if (window.innerWidth < 640) openTeamRoom(null) }}>Graph</Button>
        <Button size="sm" variant={organizationView === 'list' ? 'secondary' : 'ghost'} aria-pressed={organizationView === 'list'} onClick={() => { setOrganizationView('list'); if (window.innerWidth < 640) openTeamRoom(null) }}>List</Button>
        {teamRooms.length > 0 && <Button size="sm" variant={teamRoomId ? 'secondary' : 'ghost'} aria-expanded={!!teamRoomId} aria-controls="agent-group-chats" onClick={() => { setSelectedId(null); setCreating(null); openTeamRoom(teamRoomId ? null : teamRooms[0].id) }}><MessageSquare className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Group chats</span><span className="sm:hidden">Chats</span></Button>}
        <Button size="sm" className={window.jaitDesktop ? 'mr-36' : undefined} onClick={() => { openTeamRoom(null); setCreating({ ...newPersonaAgentDraft(), skillIds: availableSkills.map((skill) => skill.id), usesAllSkills: true }) }}><Plus className="h-4 w-4 sm:mr-1" /><span className="sr-only sm:not-sr-only">New agent</span></Button>
      </div>
    </header>
    <div className="relative flex min-h-0 flex-1">
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${current && !chatFullscreen ? "sm:mr-[min(560px,50%)]" : ""}`}>
      <div className="flex min-h-0 flex-1 flex-col">
        {interruptedAgents.length > 0 && <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2" role="status">
          <p className="flex-1 text-xs text-muted-foreground">{interruptedAgents.length} agent{interruptedAgents.length === 1 ? '' : 's'} interrupted. Choose a provider/model, then press Play to continue saved work.</p>
          <Button size="sm" variant="outline" disabled={resuming} onClick={() => void resumeInterrupted()}><Play className="mr-1 h-3.5 w-3.5" />{resuming ? 'Continuing…' : 'Resume interrupted agents'}</Button>
        </div>}
        {loading && <p className="mt-8 text-center text-sm text-muted-foreground">Loading agents…</p>}
        {!loading && agents.length === 0 && <p className="mt-12 text-center text-sm text-muted-foreground">Create an agent to start a conversation or schedule work.</p>}
        <div className="flex min-h-0 min-w-0 flex-1">
        {agents.length > 0 && <div className={`${teamRoomId ? 'hidden sm:flex' : 'flex'} min-h-0 min-w-0 flex-1 flex-col`}>{organizationView === 'graph' ? <AgentsGraph onResume={resumeWork} resumeBusy={resuming} agents={agents} threads={threads} selectedId={selectedId} onRefresh={onRefreshThreads} onSave={saveProvider} onOpen={id => { openTeamRoom(null); setSelectedId(id); setCreating(null); setConversationThreadId(null); setTab('chat') }} onChooseTask={id => { openTeamRoom(null); setSelectedId(id); setCreating(null); setConversationThreadId(null); setTab('runs') }} /> : <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4">{organizationEntries(agents).map(({ agent, depth }) => {
          return <AgentRow onResume={resumeWork} resumeBusy={resuming} key={agent.id} agent={agent} depth={depth} threads={threads} onSaveProvider={(provider, model) => saveProvider(agent.id, provider, model)} onOpen={() => { openTeamRoom(null); setSelectedId(agent.id); setConversationThreadId(null); setTab('chat') }} onChooseTask={() => { openTeamRoom(null); setSelectedId(agent.id); setConversationThreadId(null); setTab('runs') }} onRefresh={onRefreshThreads} />
        })}</div>}</div>}
        {teamRoomId && <aside id="agent-group-chats" aria-label="Group chats" className="flex min-h-0 w-full shrink-0 flex-col border-l bg-background sm:w-[42%] sm:min-w-[320px] sm:max-w-[480px]">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1" aria-label="Team conversations">
            {teamRooms.map(room => <Button key={room.id} size="sm" variant={room.id === teamRoomId ? 'secondary' : 'ghost'} aria-label={room.name} aria-pressed={room.id === teamRoomId} className="shrink-0 gap-2" onClick={() => openTeamRoom(room.id)}><TeamAvatar members={teamMembers(room.rootAgentId, agents)} runningIds={room.id === teamRoomId && room.id === teamRuntime?.roomId ? teamRuntime.runningIds : undefined} size={24} /><span className="max-w-48 truncate">{room.name}</span></Button>)}
          </nav>
          <TeamRoomView key={teamRoomId} onRuntimeChange={setTeamRuntime} embedded roomId={teamRoomId} onBack={() => openTeamRoom(null)} initialInput={teamDrafts.current.get(teamRoomId) ?? ''} onInputChange={text => teamDrafts.current.set(teamRoomId, text)} />
        </aside>}
        </div>
      </div>
    </div>
    {current && <aside aria-label="Agent details" className={`${chatFullscreen ? 'absolute inset-0' : 'absolute inset-y-0 right-0 w-full sm:w-[min(560px,50%)]'} z-20 flex min-h-0 flex-col border-l bg-background shadow-xl`}>
      <div className="shrink-0 border-b px-3 py-2">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2"><Button variant="ghost" size="sm" onClick={() => { setChatFullscreen(false); setCreating(null); setSelectedId(null); setConversationThreadId(null) }}><ArrowLeft className="mr-1 h-4 w-4" /> All agents</Button><div className="flex items-center gap-1">{selected && tab === 'chat' && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setChatFullscreen((value) => !value)} aria-label={chatFullscreen ? 'Exit full screen' : 'Full screen chat'} title={chatFullscreen ? 'Exit full screen' : 'Full screen chat'}>{chatFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>}{selected && <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy} onClick={() => { setDeleteName(''); setDeleteOpen(true) }} aria-label="Delete agent"><Trash2 className="h-4 w-4" /></Button>}</div></div>
        <div className="mx-auto mt-1 flex max-w-5xl items-center gap-2"><AgentAvatar avatar={current.avatar} running={activeChatStatus === 'running'} className="h-8 w-8" /><div className="min-w-0"><h2 className="truncate text-base font-semibold">{creating ? 'Create agent' : current.name}</h2><p className="truncate text-sm text-muted-foreground">{creating ? 'Set up your agent' : current.persona || 'Ask about their work or assign a task'}</p></div></div>
      </div>
      {creating ? <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6"><div className="mx-auto max-w-2xl space-y-5">
        <label className="block text-sm font-medium">Name<input value={current.name} onChange={(event) => change({ name: event.target.value })} placeholder="Research assistant" className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label>
        <label className="block text-sm font-medium">Role<input value={current.role ?? ''} onChange={(event) => change({ role: event.target.value })} placeholder="Research lead" className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label>
        <label className="block text-sm font-medium">Reports to<Select value={String(current.reportsToId ?? '') || '__jait_empty_selection__'} onValueChange={(selectedValue) => {
          const value = selectedValue === '__jait_empty_selection__' ? '' : selectedValue
          change({ reportsToId: value || null })
        }}>
          <SelectTrigger className="h-9 min-w-0 mt-1 w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__jait_empty_selection__">No manager (top level)</SelectItem>{availableManagers(current.id, agents).map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}{agent.role ? ` · ${agent.role}` : ''}</SelectItem>)}</SelectContent>
        </Select></label>
        <label className="block text-sm font-medium">Role and responsibilities<textarea value={current.persona} onChange={(event) => change({ persona: event.target.value })} placeholder="Research topics, create concise reports, and explain findings" className="mt-1 min-h-28 w-full rounded-md border bg-background px-3 py-2" /></label>
        <div><span className="mb-2 block text-sm font-medium">Provider and model</span><ProviderModelSelector provider={current.providerId} model={current.model ?? null} onProviderChange={(providerId) => change({ providerId, model: null })} onModelChange={(model) => change({ model })} tooltipSide="bottom" /></div>
        <fieldset><legend className="mb-2 text-sm font-medium">Avatar</legend><div className="flex flex-wrap gap-2">{PERSONA_AVATARS.map((avatar) => <button type="button" key={avatar} aria-label={`Choose ${avatar} avatar`} aria-pressed={current.avatar === avatar} onClick={() => change({ avatar })} className={`rounded-full p-1 ${current.avatar === avatar ? 'ring-2 ring-primary' : ''}`}><AgentAvatar avatar={avatar} className="h-11 w-11" /></button>)}</div></fieldset>
        <details className="text-sm"><summary className="cursor-pointer py-2 text-muted-foreground">{skillIdsFor(current).length} skills selected · Customize</summary><SkillsTable skills={availableSkills} selectedIds={skillIdsFor(current)} onChange={(skillIds) => change({ skillIds, usesAllSkills: skillIds.length === availableSkills.length })} onOpenStore={() => onOpenSettings('skills')} /></details>
        <Button disabled={busy || !current.name.trim()} onClick={() => void create()}>{busy ? 'Creating…' : 'Create agent'}</Button>
      </div></div> : <>
        <nav aria-label="Agent sections" className="mx-auto flex w-full max-w-5xl shrink-0 justify-start gap-1 overflow-x-auto px-4 py-3 sm:justify-center sm:px-6">
          {([['chat', 'Chat', MessageSquare], ['runs', 'Tasks & runs', ListChecks], ['skills', 'Skills', Sparkles], ['tools', 'Tools', Wrench], ['profile', 'Profile', Settings2]] as const).map(([id, label, Icon]) => <Button key={id} variant={tab === id ? 'secondary' : 'ghost'} size="sm" className="shrink-0" onClick={() => { setTab(id); if (id !== 'chat') setChatFullscreen(false) }}><Icon className="mr-2 h-4 w-4" />{label}</Button>)}
        </nav>
        {tab === 'chat' ? <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {discussionThread && <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-2 text-sm"><span className="truncate text-muted-foreground">Discussing {discussionThread.title}</span><Button variant="ghost" size="sm" onClick={() => setConversationThreadId(null)}>Main chat</Button></div>}
          {!discussionThread && (selected!.legacyChatThreadIds ?? []).length > 0 && <details className="mx-auto w-full max-w-4xl px-4 text-xs text-muted-foreground"><summary className="cursor-pointer py-1">Earlier conversations</summary><div className="flex flex-wrap gap-2 pb-2">{(selected!.legacyChatThreadIds ?? []).map((id) => <Button key={id} variant="ghost" size="sm" onClick={() => setConversationThreadId(id)}>{agentThreads.find((thread) => thread.id === id)?.title ?? 'Earlier chat'}</Button>)}</div></details>}
          <Conversation key={activeChatSessionId ?? activeChatThreadId ?? selected!.id} className="min-h-0 flex-1" loading={activeChatSessionId ? sessionChat.isLoadingHistory : chatLoading} loadingLabel="Loading conversation" messageContents={chatMessages.map((message) => message.content)} messageEstimateInputs={chatMessages}>
            {chatMessages.length === 0 && !(activeChatSessionId ? sessionChat.isLoadingHistory : chatLoading) && <div className="py-16 text-center text-sm text-muted-foreground">Start a conversation with {selected!.name}.</div>}
            {chatMessages.map((message, index) => <Message key={message.id} messageId={message.id} messageIndex={index} messageFromEnd={chatMessages.length - index - 1} role={message.role} content={message.content} displayContent={message.displayContent} referencedFiles={message.referencedFiles} displaySegments={message.displaySegments} toolCalls={message.toolCalls} segments={message.segments} isStreaming={activeChatStatus === 'running' && index === chatMessages.length - 1 && message.role === 'assistant'} compact preferLlmUi={false} provider={selected!.providerId} />)}
            {activeChatStatus === 'running' && <p className="mx-auto max-w-4xl px-4 py-3 text-sm text-muted-foreground">Working…</p>}
          </Conversation>
          <div className="shrink-0 px-3 pb-3 pt-2 sm:px-6"><div className="mx-auto max-w-4xl">
            <div className="mb-2 flex flex-wrap justify-end gap-2">{builderMode === 'task' && latestAssistant && activeChatStatus !== 'running' && <Button variant="secondary" size="sm" onClick={() => { setTaskName('New task'); setTaskPrompt(latestAssistant.content); setTaskCron(''); setEditingTaskId(null); setBuilderMode(null); setTab('runs') }}>Review as task</Button>}{builderMode === 'skill' && latestAssistant && activeChatStatus !== 'running' && <Button variant="ghost" size="sm" onClick={() => { onRefreshSkills(); setTab('skills') }}>View skills</Button>}{(activeChatSessionId || activeChatThreadId) && <Button variant="ghost" size="sm" onClick={() => startNewChat()}><Plus className="mr-1 h-4 w-4" /> New chat</Button>}</div>
            <PromptInput key={selected!.id} availableSkills={availableSkills.filter((skill) => skillIdsFor(selected!).includes(skill.id))} value={chatInput} syncKey={chatInputVersion} onChange={setChatInput} onSubmit={(chipFiles, attachments, segments) => { void askAgent(chipFiles, attachments, segments) }} onStop={() => { void stopAgent() }} isLoading={activeChatStatus === 'running'} disabled={busy || activeChatStatus === 'running' || sessionChat.isLoadingHistory} submitLoading={busy} placeholder={`Message ${selected!.name}…`} draftStateKey={`agent:${selected!.id}:${activeChatSessionId ?? activeChatThreadId ?? 'new'}`} footerLeadingContent={<span className="px-1 text-xs font-medium text-muted-foreground">Agent</span>} provider={selected!.providerId} cliModel={selected!.model ?? null} onProviderChange={(providerId) => startNewChat({ providerId, model: null })} onCliModelChange={(model) => startNewChat({ model })} chatId={activeChatSessionId ?? activeChatThreadId} />
          </div></div>
        </div> : <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"><div className="mx-auto max-w-4xl">
            {tab === 'runs' && <div className="space-y-6"><div><h2 className="font-semibold">Tasks & runs</h2><p className="text-sm text-muted-foreground">Tasks describe outcomes. Add a schedule when you want the agent to run one automatically.</p><Button variant="secondary" size="sm" className="mt-3" onClick={() => prepareBuilderChat('task')}><Sparkles className="mr-2 h-4 w-4" />Plan a task with AI</Button></div>
              <div className="rounded-lg border p-4"><h3 className="font-medium">{editingTaskId ? 'Edit task' : 'New task'}</h3><div className="mt-3 grid gap-3"><input aria-label="Task name" value={taskName} onChange={(event) => setTaskName(event.target.value)} placeholder="Weekly research report" className="rounded-md border bg-background px-3 py-2 text-sm" /><textarea aria-label="Task instructions" value={taskPrompt} onChange={(event) => setTaskPrompt(event.target.value)} placeholder="Research the latest updates and write a report" className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm" /><label className="text-sm">Cron schedule (optional)<input aria-label="Task cron schedule" value={taskCron} onChange={(event) => setTaskCron(event.target.value)} placeholder="0 9 * * 1" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" /></label></div><div className="mt-3 flex gap-2"><Button size="sm" disabled={busy || !taskName.trim() || !taskPrompt.trim()} onClick={() => void saveTask()}>{editingTaskId ? 'Save task' : 'Add task'}</Button>{editingTaskId && <Button size="sm" variant="ghost" onClick={clearTaskForm}>Cancel</Button>}</div></div>
              <div className="space-y-2">{(selected!.tasks ?? []).map((task) => <div key={task.id} className="rounded-lg border p-3"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm">{task.name}</strong><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{task.prompt}</p>{task.cron && <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" />{task.cron}{selected!.paused ? ' · Paused' : ' · Active'}</span>}</div><Button size="sm" variant="ghost" disabled={busy} onClick={() => void deleteTask(task)} aria-label={`Delete ${task.name}`}><Trash2 className="h-4 w-4" /></Button></div><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void runTask(task)}>Run now</Button><Button size="sm" variant="ghost" onClick={() => { setTaskName(task.name); setTaskPrompt(task.prompt); setTaskCron(task.cron); setEditingTaskId(task.id) }}>Edit</Button></div></div>)}{!(selected!.tasks ?? []).length && <p className="text-sm text-muted-foreground">No tasks yet.</p>}</div>
              <label className="block text-sm">Repository for manual runs<Select value={String(runRepoId) || '__jait_empty_selection__'} onValueChange={(selectedValue) => {
                const value = selectedValue === '__jait_empty_selection__' ? '' : selectedValue
                setRunRepoId(value)
              }}>
                <SelectTrigger aria-label="Run repository" className="h-9 min-w-0 mt-1 w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="__jait_empty_selection__">No repository</SelectItem>{repositories.map((repo) => <SelectItem key={repo.id} value={repo.id}>{repo.name}</SelectItem>)}</SelectContent>
              </Select></label>
              <div className="border-t pt-4"><h3 className="font-medium">Run history</h3><div className="mt-2 space-y-2">{agentThreads.filter((thread) => thread.id !== selected!.chatThreadId && !(selected!.legacyChatThreadIds ?? []).includes(thread.id)).map((thread) => <div key={thread.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"><span>{thread.title}<span className="ml-2 text-xs text-muted-foreground">{new Date(thread.updatedAt).toLocaleString()} · {thread.status}</span></span><span className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setConversationThreadId(thread.id); setTab('chat') }}>Discuss run</Button><Button size="sm" variant="ghost" onClick={() => onOpenThread(thread.id)}>Details</Button></span></div>)}{!agentThreads.some((thread) => thread.id !== selected!.chatThreadId && !(selected!.legacyChatThreadIds ?? []).includes(thread.id)) && <p className="text-sm text-muted-foreground">No runs yet.</p>}</div></div>
            </div>}
            {tab === 'skills' && <div className="space-y-5"><div><h2 className="font-semibold">Skills</h2><p className="text-sm text-muted-foreground">Skills teach the agent reusable workflows. Tasks are the work you ask it to do.</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={() => prepareBuilderChat('skill')}><Sparkles className="mr-2 h-4 w-4" />Create a skill with AI</Button><Button variant="ghost" size="sm" onClick={onRefreshSkills}>Refresh installed skills</Button></div></div><p className="text-sm text-muted-foreground">{skillIdsFor(selected!).length} of {availableSkills.length} installed skills selected.</p><details className="text-sm"><summary className="cursor-pointer py-2 text-muted-foreground">Customize skills</summary><SkillsTable skills={availableSkills} selectedIds={skillIdsFor(selected!)} onChange={(skillIds) => change({ skillIds, usesAllSkills: skillIds.length === availableSkills.length })} onOpenStore={() => onOpenSettings('skills')} /></details></div>}
            {tab === 'tools' && <div className="space-y-4">
              <h2 className="font-semibold">Tools</h2>
              <p className="text-sm text-muted-foreground">This agent can use the tools enabled for your account. You only need to change them if a tool is unavailable or you want to restrict access.</p>
              <Button variant="outline" onClick={() => onOpenSettings('tools')}>Manage account tools <ExternalLink className="ml-2 h-4 w-4" /></Button>
              <details className="text-sm">
                <summary className="cursor-pointer py-2 text-muted-foreground">{availableTools.filter((tool) => tool.enabled).length} enabled tools</summary>
                <div className="max-h-80 space-y-3 overflow-y-auto py-2">
                  {availableTools.filter((tool) => tool.enabled).map((tool) => <div key={tool.name}><strong>{tool.name}</strong>{tool.description && <p className="text-xs text-muted-foreground">{tool.description}</p>}</div>)}
                  {!availableTools.some((tool) => tool.enabled) && <p className="text-muted-foreground">No enabled tools found.</p>}
                </div>
              </details>
            </div>}
            {tab === 'profile' && <div className="max-w-2xl space-y-5"><h2 className="font-semibold">Profile</h2><label className="block text-sm font-medium">Name<input value={selected!.name} onChange={(event) => change({ name: event.target.value })} onBlur={() => syncSchedules(selected!)} className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label><label className="block text-sm font-medium">Role<input value={selected!.role ?? ''} onChange={(event) => change({ role: event.target.value })} className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label><label className="block text-sm font-medium">Reports to<Select value={String(selected!.reportsToId ?? '') || '__jait_empty_selection__'} onValueChange={(selectedValue) => {
              const value = selectedValue === '__jait_empty_selection__' ? '' : selectedValue
              change({ reportsToId: value || null })
            }}>
              <SelectTrigger className="h-9 min-w-0 mt-1 w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="__jait_empty_selection__">No manager (top level)</SelectItem>{availableManagers(selected!.id, agents).map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}{agent.role ? ` · ${agent.role}` : ''}</SelectItem>)}</SelectContent>
            </Select></label><div className="rounded-lg border p-3 text-sm"><strong>Direct reports</strong><p className="mt-1 text-muted-foreground">{agents.filter((agent) => agent.reportsToId === selected!.id).map((agent) => agent.name).join(', ') || 'None yet'}</p></div><label className="block text-sm font-medium">Role and responsibilities<textarea value={selected!.persona} onChange={(event) => change({ persona: event.target.value })} onBlur={() => syncSchedules(selected!)} className="mt-1 min-h-28 w-full rounded-md border bg-background px-3 py-2" /></label><div><span className="mb-2 block text-sm font-medium">Provider and model</span><ProviderModelSelector provider={selected!.providerId} model={selected!.model ?? null} onProviderChange={(providerId) => change({ providerId, model: null })} onModelChange={(model) => change({ model })} tooltipSide="bottom" /></div><fieldset><legend className="mb-2 text-sm font-medium">Avatar</legend><div className="flex flex-wrap gap-2">{PERSONA_AVATARS.map((avatar) => <button type="button" key={avatar} aria-label={`Choose ${avatar} avatar`} aria-pressed={selected!.avatar === avatar} onClick={() => change({ avatar })} className={`rounded-full p-1 ${selected!.avatar === avatar ? 'ring-2 ring-primary' : ''}`}><AgentAvatar avatar={avatar} className="h-11 w-11" /></button>)}</div></fieldset><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected!.requiresApproval} onChange={(event) => change({ requiresApproval: event.target.checked })} />Require approval for actions</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!selected!.paused} disabled={busy} onChange={(event) => void setPaused(!event.target.checked)} />Enable scheduled tasks</label></div>}
        </div></div>}
      </>}
    </aside>}
    </div>
    <Dialog open={deleteOpen} onOpenChange={(open) => { if (!busy) { setDeleteOpen(open); if (!open) setDeleteName('') } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {selected?.name}?</DialogTitle>
          <DialogDescription>This removes the agent and its scheduled tasks. Type the agent name to confirm.</DialogDescription>
        </DialogHeader>
        <label className="space-y-2 text-sm font-medium">Agent name
          <span className="block text-muted-foreground font-normal">{selected?.name}</span>
          <input autoFocus autoComplete="off" aria-label="Type agent name to confirm" value={deleteName} onChange={(event) => setDeleteName(event.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-foreground" />
        </label>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="destructive" disabled={busy || !selected || deleteName !== selected.name} onClick={() => void remove()}>{busy ? 'Deleting…' : 'Delete agent'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
}
