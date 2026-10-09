import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TeamRoomMessage } from '@jait/shared'
import { ArrowDown, ArrowLeft, ExternalLink, MoreHorizontal } from 'lucide-react'
import { teamChatApi, type TeamRoomSnapshot } from '@/lib/team-chat-api'
import { Button } from '@/components/ui/button'
import { PromptInput, type PromptInputHandle } from '@/components/chat/prompt-input'
import type { ChatAttachment } from '@/hooks/useChat'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AgentAvatar } from './agent-avatar'
import { TeamAvatar } from './team-avatar'
import { agentsApi } from '@/lib/agents-api'
import { useStickToBottom } from '@/components/chat/use-stick-to-bottom'

export function TeamMessageAvatar({ message }: { message: TeamRoomMessage }) {
  if (message.sender.kind === 'chat') return <span role="img" aria-label="Neutral chat persona" className="mt-1 h-8 w-8 shrink-0 rounded-full bg-gray-400" />
  if (message.sender.kind === 'agent') return <AgentAvatar avatar={message.sender.avatar || 'Nova'} className="h-8 w-8 shrink-0" />
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs">{message.sender.name.slice(0, 2)}</span>
}
const expandedRoomGoals = new Map<string, boolean>()
const roomGoalStorageKey = (roomId: string) => 'jait:team-goal:' + roomId

function isRoomGoalExpanded(roomId: string) {
  try {
    const saved = sessionStorage.getItem(roomGoalStorageKey(roomId))
    if (saved !== null) return saved === 'true'
  } catch { /* Keep room state in memory when browser storage is unavailable. */ }
  return expandedRoomGoals.get(roomId) ?? false
}

export function TeamGoalPanel({ roomId, goal }: { roomId: string; goal: NonNullable<TeamRoomSnapshot['room']['goal']> }) {
  const [expanded, setExpanded] = useState(() => isRoomGoalExpanded(roomId))
  return <details open={expanded} onToggle={event => {
    const next = event.currentTarget.open
    expandedRoomGoals.set(roomId, next)
    try { sessionStorage.setItem(roomGoalStorageKey(roomId), String(next)) } catch { /* In-memory fallback above. */ }
    setExpanded(next)
  }} className="border-b bg-muted/40 px-5 py-3 text-sm">
    <summary className="min-h-11 cursor-pointer content-center rounded-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Goal · {goal.status}</summary>
    <p className="mt-2">{goal.description}</p>
    <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{goal.criteria.map((criterion, index) => <li key={index}>{criterion}{goal.evidence?.[index] && <span> — {goal.evidence[index]}</span>}</li>)}</ul>
  </details>
}

export function TeamRoomView({ roomId, onBack }: { roomId: string; onBack: () => void }) {
  const [snapshot, setSnapshot] = useState<TeamRoomSnapshot | null>(null)
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [decisionMessage, setDecisionMessage] = useState<TeamRoomMessage | null>(null)
  const [input, setInput] = useState('')
  const composer = useRef<PromptInputHandle>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const { scrollRef, contentRef, isAtBottom, onScroll, scrollToBottom } = useStickToBottom()
  const retryKey = useRef<{ content: string; signature: string; key: string } | null>(null)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async () => {
      try {
        const next = await teamChatApi.get(roomId)
        if (!active) return
        setSnapshot(next); setListError(null)
        // Deliveries are persisted history; confirm execution before animating.
        const sources = new Map<string, { kind: 'sessions' | 'threads'; id: string; agentId: string }>()
        const addSource = (kind: 'sessions' | 'threads', id: string, agentId: string) => {
          sources.set(kind + ':' + id, { kind, id, agentId })
        }
        for (const member of next.members) {
          if (typeof member.chatThreadId === 'string' && member.chatThreadId) addSource('threads', member.chatThreadId, member.id)
          else if (typeof member.chatSessionId === 'string' && member.chatSessionId) addSource('sessions', member.chatSessionId, member.id)
        }
        for (const delivery of next.deliveries) {
          if (delivery.status !== 'running' || !next.members.some(member => member.id === delivery.agentId)) continue
          addSource(delivery.threadId ? 'threads' : 'sessions', delivery.threadId || delivery.sessionId, delivery.agentId)
        }
        const results = await Promise.allSettled([...sources.values()].map(async ({ kind, id, agentId }) => ({ agentId, runtime: await agentsApi.getAgentRuntime(kind, id) })))
        if (active) setRunningIds(new Set(results.flatMap(result => result.status === 'fulfilled' && result.value.runtime.running ? [result.value.agentId] : [])))
      }
      catch (error) { if (active) { setRunningIds(new Set()); setListError(error instanceof Error ? error.message : 'Could not load conversation') } }
      finally { if (active) timer = setTimeout(() => { void refresh() }, 2000) }
    }
    setSnapshot(null); setRunningIds(new Set()); setDecisionMessage(null)
    setInput(''); setError(null); retryKey.current = null
    void refresh()
    return () => { active = false; clearTimeout(timer) }
  }, [roomId])
  const loadedRoomId = snapshot?.room.id
  useLayoutEffect(() => {
    if (loadedRoomId) scrollToBottom('auto')
  }, [loadedRoomId, scrollToBottom])
  const send = async (attachments: ChatAttachment[] = []) => {
    if ((!input.trim() && !attachments.length) || sending) return
    const content = input.trim() || 'Please review the attached files.'
    const signature = JSON.stringify(attachments)
    const previous = retryKey.current
    const key = previous?.content === content && previous.signature === signature ? previous.key : crypto.randomUUID()
    retryKey.current = { content, signature, key }
    setSending(true); setError(null)
    try {
      await teamChatApi.post(roomId, { content, attachments, clientKey: key })
      retryKey.current = null; setInput('')
      setSnapshot(await teamChatApi.get(roomId))
    } catch (error) { setInput(content); attachments.forEach(attachment => composer.current?.addAttachment(attachment)); setError(error instanceof Error ? error.message : 'Could not send message') }
    finally { setSending(false) }
  }
  return <div className="flex min-h-0 flex-1 flex-col">
    <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
      <Button size="icon" variant="ghost" onClick={onBack} aria-label="Back to agents"><ArrowLeft className="h-4 w-4" /></Button>
      <TeamAvatar members={snapshot?.members ?? []} runningIds={runningIds} />
      <div className="min-w-0"><h1 className="truncate font-semibold">{snapshot?.room.name ?? 'Team conversation'}</h1>
        <p className="truncate text-xs text-muted-foreground">{snapshot?.members.map(member => member.name).join(', ')}</p></div>
    </header>
    {snapshot?.room.goal && <TeamGoalPanel key={roomId} roomId={roomId} goal={snapshot.room.goal} />}
    <div className="relative min-h-0 flex-1">
    <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain p-4" aria-label="Team conversation" role="log" aria-live="polite">
      <div ref={contentRef} className="min-h-full">
      {listError && <p role="alert" className="text-sm text-destructive">{listError}</p>}
      {snapshot && snapshot.messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Tell the team what you want to accomplish. The team will route your message to the right agent.</p>}
      <div className="mx-auto max-w-3xl space-y-5">{snapshot?.messages.map(message => {
        const decision = message.routingDecision ?? snapshot.messages.find(parent => parent.id === message.parentMessageId)?.routingDecision
        const deliveries = snapshot.deliveries.filter(delivery => delivery.messageId === message.id)
        return <article key={message.id} className="flex items-start gap-3" data-testid="team-message">
          <TeamMessageAvatar message={message} />
          <div className="min-w-0 flex-1 rounded-lg bg-muted/50 px-3 py-2">
            <div className="flex flex-wrap items-baseline gap-2"><strong className="text-sm">{message.sender.name}</strong>
              <time className="text-[10px] text-muted-foreground" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              {message.kind !== 'discussion' && <span className="text-[10px] text-muted-foreground">{message.kind}</span>}
              <DropdownMenu><DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" aria-label={`Message actions for ${message.sender.name}`}><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger><DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setDecisionMessage({ ...message, routingDecision: decision })}>View routing decision</DropdownMenuItem>
              </DropdownMenuContent></DropdownMenu>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.content}</p>
            {message.attachments?.map((attachment, index) => <p key={index} className="mt-1 text-xs text-muted-foreground">📎 {attachment.name}</p>)}
            {message.recipientIds.length > 0 && <p className="mt-2 text-xs text-muted-foreground">To: {message.recipientIds.map(id => snapshot.members.find(member => member.id === id)?.name ?? id).join(', ')}</p>}
            {message.sender.kind === 'chat' && message.sender.sourceSessionId && <a href={'/?sessionId=' + encodeURIComponent(message.sender.sourceSessionId)} className="mt-2 inline-flex items-center gap-1 text-xs text-primary">Source chat <ExternalLink className="h-3 w-3" /></a>}
            {message.workSessionId && <a href={message.workThreadId ? '/threads?threadId=' + encodeURIComponent(message.workThreadId) : '/?sessionId=' + encodeURIComponent(message.workSessionId)} className="mt-2 inline-flex items-center gap-1 text-xs text-primary">{message.workThreadId ? 'Work thread' : 'Work conversation'} <ExternalLink className="h-3 w-3" /></a>}
            {deliveries.map(delivery => <div key={delivery.id} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <a className="text-primary" href={delivery.threadId ? '/threads?threadId=' + encodeURIComponent(delivery.threadId) : '/?sessionId=' + encodeURIComponent(delivery.sessionId)}>{snapshot.members.find(member => member.id === delivery.agentId)?.name ?? 'Agent'} · {delivery.threadId ? 'Work thread' : 'Work conversation'}</a>
              <span className={delivery.status === 'failed' || delivery.status === 'interrupted' ? 'text-destructive' : 'text-muted-foreground'}>{delivery.status}</span>
              {delivery.error && <span className="text-destructive">{delivery.error}</span>}
            </div>)}
          </div>
        </article>
      })}</div>
      </div>
    </div>
    {!isAtBottom && <Button variant="secondary" size="icon" className="absolute bottom-3 right-4 h-11 w-11 rounded-full shadow-md"
      aria-label="Jump to latest messages" onClick={() => scrollToBottom(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')}>
      <ArrowDown className="h-5 w-5" />
    </Button>}
    </div>
    <Dialog open={!!decisionMessage} onOpenChange={open => { if (!open) setDecisionMessage(null) }}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Routing decision</DialogTitle><DialogDescription>How this message was assigned to a team member.</DialogDescription></DialogHeader>
        {decisionMessage?.routingDecision ? <div className="space-y-3 text-sm">
          <p><strong>{decisionMessage.routingDecision.source === 'system-one' ? 'System One' : 'Fallback routing'}</strong>{decisionMessage.routingDecision.model && ` · ${decisionMessage.routingDecision.model}`}</p>
          <p>Selected: <strong>{decisionMessage.routingDecision.candidates.find(member => member.id === decisionMessage.routingDecision?.recipientId)?.name ?? snapshot?.members.find(member => member.id === decisionMessage.routingDecision?.recipientId)?.name ?? decisionMessage.routingDecision.recipientId}</strong></p>
          <p>{decisionMessage.routingDecision.reason}</p>
          {decisionMessage.routingDecision.confidence !== undefined && <p>Confidence: {Math.round(decisionMessage.routingDecision.confidence * 100)}%</p>}
          <details><summary className="cursor-pointer">Candidates considered</summary><ul className="mt-2 space-y-3">{decisionMessage.routingDecision.candidates.map(member => <li key={member.id}>
            <strong>{member.name}</strong>{member.role && ` · ${member.role}`}<p className="whitespace-pre-wrap text-muted-foreground">{member.persona}</p>
            {decisionMessage.routingDecision?.source === 'fallback' && <p>Ranking score: {member.score}</p>}
          </li>)}</ul></details>
        </div> : <p className="text-sm text-muted-foreground">No routing decision was recorded for this message. It may predate decision history, have explicitly addressed recipients, or be a passive team update.</p>}
      </DialogContent>
    </Dialog>
    <div className="shrink-0 border-t p-4">
      <div className="mx-auto max-w-3xl space-y-2">
        <PromptInput key={roomId} ref={composer} value={input} onChange={setInput} onSubmit={(_files, attachments) => { void send(attachments) }}
          disabled={!snapshot || sending} submitLoading={sending} placeholder="Message the team…" showSendTargetSelector={false} />
        <p className="text-xs text-muted-foreground">The team chooses who responds based on roles and conversation context.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  </div>
}
