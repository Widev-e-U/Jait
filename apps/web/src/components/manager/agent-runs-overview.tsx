import { useEffect, useState } from 'react'
import type { AgentRuntime } from '@jait/shared'
import { Activity, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { agentsApi, type AgentThread } from '@/lib/agents-api'
import type { PersonaAgentDraft } from '@/lib/persona-agents'

export function AgentRunsOverview({ agent, threads, onOpenThread, onChat, onDiscuss }: {
  agent: PersonaAgentDraft
  threads: AgentThread[]
  onOpenThread: (id: string) => void
  onChat: () => void
  onDiscuss: (id: string) => void
}) {
  const [chatRuntime, setChatRuntime] = useState<AgentRuntime | null>(null)
  const [chatUnavailable, setChatUnavailable] = useState(false)
  useEffect(() => {
    setChatRuntime(null)
    setChatUnavailable(false)
    if (!agent.chatSessionId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try {
        const runtime = await agentsApi.getAgentRuntime('sessions', agent.chatSessionId!)
        if (!cancelled) { setChatRuntime(runtime); setChatUnavailable(false) }
      } catch { if (!cancelled) setChatUnavailable(true) }
      if (!cancelled) timer = setTimeout(() => { void refresh() }, 3000)
    }
    void refresh()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [agent.chatSessionId])
  const work = threads.filter(thread => thread.id !== agent.chatThreadId && !(agent.legacyChatThreadIds ?? []).includes(thread.id))
  const current = work.filter(thread => thread.status === 'running')
  const history = work.filter(thread => !current.includes(thread))
  const legacyChat = !agent.chatSessionId ? threads.find(thread => thread.id === agent.chatThreadId && thread.status === 'running') : undefined
  const chatRunning = Boolean(chatRuntime?.running || legacyChat)
  const chatChecking = Boolean(agent.chatSessionId && !chatRuntime && !chatUnavailable)
  const renderRun = (thread: AgentThread) => <div key={thread.id} className="rounded-lg border bg-background p-3 text-sm">
    <div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words font-medium">{thread.title}</p><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${thread.status === 'running' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{thread.status.replaceAll('_', ' ')}</span></div>
    <p className="mt-1 text-xs text-muted-foreground">{new Date(thread.updatedAt).toLocaleString()}</p>
    {thread.error && <p className="mt-2 break-words text-xs text-destructive">{thread.error}</p>}
    <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => onOpenThread(thread.id)}>Details</Button><Button size="sm" variant="ghost" onClick={() => onDiscuss(thread.id)}>Discuss run</Button></div>
  </div>
  return <>
    <section aria-label="Current runs" className="space-y-3">
      <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-semibold"><Activity className="h-4 w-4 text-primary" />Current runs</h2><span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">{current.length + Number(chatRunning)} active</span></div>
      {chatRunning && <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm"><div><p className="flex items-center gap-2 font-medium"><MessageSquare className="h-4 w-4" />Agent chat</p><p className="mt-1 text-xs text-muted-foreground">{chatUnavailable ? 'Last known running · activity unavailable' : 'Working in the main conversation'}</p></div><Button size="sm" variant="outline" onClick={onChat}>Open chat</Button></div>}
      {current.map(renderRun)}
      {chatChecking && <p role="status" className="text-xs text-muted-foreground">Checking chat activity…</p>}
      {chatUnavailable && !chatRunning && <p role="status" className="text-xs text-muted-foreground">Chat activity is unavailable. <button type="button" className="underline" onClick={onChat}>Open chat</button></p>}
      {!current.length && !chatRunning && !chatChecking && !chatUnavailable && <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No work running right now. Start a saved task below or <button type="button" className="text-foreground underline" onClick={onChat}>ask in chat</button>.</div>}
    </section>
    <details className="rounded-lg border" open={history.some(thread => thread.status === 'error' || thread.status === 'interrupted')}><summary className="cursor-pointer px-3 py-2 text-sm font-medium">Run history <span className="ml-1 text-muted-foreground">({history.length})</span></summary><div className="space-y-2 border-t p-3">{history.map(renderRun)}{!history.length && <p className="text-sm text-muted-foreground">No past runs yet.</p>}</div></details>
  </>
}
