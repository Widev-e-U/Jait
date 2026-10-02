import { useEffect, useState } from 'react'
import type { AgentRuntime } from '@jait/shared'
import { Loader2, Play, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { agentsApi, type AgentThread } from '@/lib/agents-api'
import type { PersonaAgentDraft } from '@/lib/persona-agents'
import { earliestAgentStart, formatAgentElapsed } from '@/lib/agent-runtime'
import { AgentAvatar } from './agent-avatar'

interface RuntimeSource { kind: 'sessions' | 'threads'; id: string }
interface ActiveSource extends RuntimeSource { runtime: AgentRuntime }
export function AgentRow({ agent, depth, threads, onOpen, onChooseTask, onRefresh }: {
  agent: PersonaAgentDraft; depth: number; threads: AgentThread[]
  onOpen: () => void; onChooseTask: () => void; onRefresh: () => void
}) {
  const ownThreads = threads.filter((thread) => thread.personaAgentId === agent.id || thread.id === agent.chatThreadId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const latest = ownThreads[0]
  const sourcesKey = JSON.stringify([
    ...(agent.chatSessionId ? [{ kind: 'sessions', id: agent.chatSessionId }] : []),
    ...ownThreads.filter((thread) => thread.status === 'running').map((thread) => ({ kind: 'threads', id: thread.id })),
  ])
  const [active, setActive] = useState<ActiveSource[]>([])
  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const sources = JSON.parse(sourcesKey) as RuntimeSource[]
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    setAvailable(false)
    const refresh = async () => {
      const results = await Promise.allSettled(sources.map(async (source) => ({ ...source, runtime: await agentsApi.getAgentRuntime(source.kind, source.id) })))
      if (cancelled) return
      setAvailable(results.every((result) => result.status === 'fulfilled'))
      // Preserve known running controls during a transient network failure.
      setActive((previous) => sources.flatMap((source, index) => {
        const result = results[index]
        const value = result.status === 'fulfilled' ? result.value : previous.find((item) => item.kind === source.kind && item.id === source.id)
        return value?.runtime.running ? [value] : []
      }))
      timer = setTimeout(() => { void refresh() }, 3000)
    }
    void refresh()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [sourcesKey, refreshVersion])
  const running = active.length > 0
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  const toggle = async () => {
    if (!running && latest?.status !== 'interrupted') { onChooseTask(); return }
    setBusy(true)
    try {
      if (running) {
        const results = await Promise.allSettled(active.map((source) => source.kind === 'sessions' ? agentsApi.cancelAgentSession(source.id) : agentsApi.stopThread(source.id)))
        const failed = results.find((result) => result.status === 'rejected')
        if (failed?.status === 'rejected') throw failed.reason
      } else if (latest) {
        await agentsApi.startThread(latest.id, { message: 'Continue the stopped task from where you left off.' })
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not change agent activity') }
    finally { setBusy(false); setRefreshVersion((value) => value + 1); onRefresh() }
  }
  const action = running ? 'Stop' : latest?.status === 'interrupted' ? 'Resume' : 'Choose task for'
  return <div data-testid="agent-row" className={`group flex items-center gap-2 rounded-xl px-3 py-3 transition-colors ${running ? 'bg-primary/5' : 'hover:bg-muted/50'}`} style={{ marginLeft: `${Math.min(depth, 4) * 16}px` }}>
    <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Open ${agent.name}`}>
      <AgentAvatar avatar={agent.avatar} running={running} className="h-12 w-12" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2"><strong className="truncate text-sm font-semibold">{agent.name || 'Untitled agent'}</strong><span className="hidden truncate text-xs text-muted-foreground sm:inline">{agent.role || 'Agent'}</span></span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{!available ? 'Checking activity…' : running ? active.length > 1 ? `${active.length} active runs · ${latest?.title ?? 'Agent chat'}` : active[0].kind === 'sessions' ? 'Working in chat' : ownThreads.find((thread) => thread.id === active[0].id)?.title ?? 'Working' : latest?.status === 'error' ? 'Needs attention' : latest?.status === 'interrupted' ? `Stopped · ${latest.title}` : latest ? `Last task: ${latest.title}` : agent.role || 'Assign a task to get started'}</span>
      </span>
    </button>
    {running && <span title="Elapsed time for the earliest active run" aria-label="Running time" className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{formatAgentElapsed(earliestAgentStart(active.map((source) => source.runtime)), now)}</span>}
    <Button variant={running ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9 shrink-0 rounded-full" disabled={busy || !available} title={`${action} ${agent.name}`} aria-label={`${action} ${agent.name}`} onClick={() => void toggle()}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : running ? <Square className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
    </Button>
  </div>
}
