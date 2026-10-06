import { useEffect, useRef, useState } from 'react'
import type { TeamRoomMessage } from '@jait/shared'
import { ArrowLeft, ExternalLink, Send, UsersRound } from 'lucide-react'
import { teamChatApi, type TeamRoomSnapshot } from '@/lib/team-chat-api'
import { Button } from '@/components/ui/button'
import { AgentAvatar } from './agent-avatar'

export function TeamMessageAvatar({ message }: { message: TeamRoomMessage }) {
  if (message.sender.kind === 'chat') return <span role="img" aria-label="Neutral chat persona" className="mt-1 h-8 w-8 shrink-0 rounded-full bg-gray-400" />
  if (message.sender.kind === 'agent') return <AgentAvatar avatar={message.sender.avatar || 'Nova'} className="h-8 w-8 shrink-0" />
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs">{message.sender.name.slice(0, 2)}</span>
}
export function TeamRoomView({ roomId, onBack }: { roomId: string; onBack: () => void }) {
  const [snapshot, setSnapshot] = useState<TeamRoomSnapshot | null>(null)
  const [input, setInput] = useState('')
  const [targetSessionId, setTargetSessionId] = useState('')
  const [recipient, setRecipient] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const retryKey = useRef<{ content: string; recipient: string; targetSessionId: string; key: string } | null>(null)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async () => {
      try { const next = await teamChatApi.get(roomId); if (active) { setSnapshot(next); setListError(null) } }
      catch (error) { if (active) setListError(error instanceof Error ? error.message : 'Could not load conversation') }
      finally { if (active) timer = setTimeout(() => { void refresh() }, 2000) }
    }
    setSnapshot(null)
    setRecipient(''); setTargetSessionId(''); setInput(''); setError(null); retryKey.current = null
    void refresh()
    return () => { active = false; clearTimeout(timer) }
  }, [roomId])
  const count = snapshot?.messages.length ?? 0
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [count])
  const send = async () => {
    if (!input.trim() || sending) return
    const content = input.trim()
    const previous = retryKey.current
    const key = previous?.content === content && previous.recipient === recipient && previous.targetSessionId === targetSessionId ? previous.key : crypto.randomUUID()
    retryKey.current = { content, recipient, targetSessionId, key }
    setSending(true); setError(null)
    try {
      await teamChatApi.post(roomId, { content, clientKey: key, ...(targetSessionId ? { targetSessionId } : {}), ...(recipient ? { recipientIds: [recipient] } : {}) })
      retryKey.current = null; setInput('')
      setSnapshot(await teamChatApi.get(roomId))
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not send message') }
    finally { setSending(false) }
  }
  return <div className="flex min-h-0 flex-1 flex-col">
    <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
      <Button size="icon" variant="ghost" onClick={onBack} aria-label="Back to agents"><ArrowLeft className="h-4 w-4" /></Button>
      <UsersRound className="h-6 w-6 text-muted-foreground" />
      <div className="min-w-0"><h1 className="truncate font-semibold">{snapshot?.room.name ?? 'Team conversation'}</h1>
        <p className="truncate text-xs text-muted-foreground">{snapshot?.members.map(member => member.name).join(', ')}</p></div>
    </header>
    {snapshot?.room.goal && <div className="border-b bg-muted/40 px-5 py-3 text-sm">
      <p><strong>Goal · {snapshot.room.goal.status}</strong> {snapshot.room.goal.description}</p>
      <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{snapshot.room.goal.criteria.map((criterion, index) => <li key={index}>{criterion}{snapshot.room.goal?.evidence?.[index] && <span> — {snapshot.room.goal.evidence[index]}</span>}</li>)}</ul>
    </div>}
    <div className="min-h-0 flex-1 overflow-y-auto p-4" aria-label="Team conversation" role="log" aria-live="polite">
      {listError && <p role="alert" className="text-sm text-destructive">{listError}</p>}
      {snapshot && snapshot.messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Tell the team what you want to accomplish. The coordinator will organize the work here.</p>}
      <div className="mx-auto max-w-3xl space-y-5">{snapshot?.messages.map(message => {
        const deliveries = snapshot.deliveries.filter(delivery => delivery.messageId === message.id)
        return <article key={message.id} className="flex items-start gap-3" data-testid="team-message">
          <TeamMessageAvatar message={message} />
          <div className="min-w-0 flex-1 rounded-lg bg-muted/50 px-3 py-2">
            <div className="flex flex-wrap items-baseline gap-2"><strong className="text-sm">{message.sender.name}</strong>
              <time className="text-[10px] text-muted-foreground" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              {message.kind !== 'discussion' && <span className="text-[10px] text-muted-foreground">{message.kind}</span>}
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.content}</p>
            {message.recipientIds.length > 0 && <p className="mt-2 text-xs text-muted-foreground">To: {message.recipientIds.map(id => snapshot.members.find(member => member.id === id)?.name ?? id).join(', ')}</p>}
            {message.sender.kind === 'chat' && message.sender.sourceSessionId && <a href={'/?sessionId=' + encodeURIComponent(message.sender.sourceSessionId)} className="mt-2 inline-flex items-center gap-1 text-xs text-primary">Source chat <ExternalLink className="h-3 w-3" /></a>}
            {message.workSessionId && <a href={'/?sessionId=' + encodeURIComponent(message.workSessionId)} className="mt-2 inline-flex items-center gap-1 text-xs text-primary">Work conversation <ExternalLink className="h-3 w-3" /></a>}
            {deliveries.map(delivery => <div key={delivery.id} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <a className="text-primary" href={'/?sessionId=' + encodeURIComponent(delivery.sessionId)}>{snapshot.members.find(member => member.id === delivery.agentId)?.name ?? 'Agent'} · Work conversation</a>
              <span className={delivery.status === 'failed' || delivery.status === 'interrupted' ? 'text-destructive' : 'text-muted-foreground'}>{delivery.status}</span>
              {delivery.error && <span className="text-destructive">{delivery.error}</span>}
            </div>)}
          </div>
        </article>
      })}</div><div ref={bottom} />
    </div>
    <form className="shrink-0 border-t p-4" onSubmit={event => { event.preventDefault(); void send() }}>
      <div className="mx-auto max-w-3xl space-y-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">Send to
          <select aria-label="Message recipient" value={recipient} onChange={event => { setRecipient(event.target.value); setTargetSessionId('') }} className="rounded border bg-background px-2 py-1">
            <option value="">Team coordinator</option>{snapshot?.members.map(member => <option key={member.id} value={member.id}>{member.name}{member.paused ? ' (paused)' : ''}</option>)}
          </select>
        </label>
        {recipient && snapshot?.deliveries.some(delivery => delivery.agentId === recipient) && <label className="flex items-center gap-2 text-xs text-muted-foreground">Conversation<select aria-label="Work conversation" value={targetSessionId} onChange={event => setTargetSessionId(event.target.value)} className="max-w-xs rounded border bg-background px-2 py-1"><option value="">New work conversation</option>{snapshot.deliveries.filter(delivery => delivery.agentId === recipient).filter((delivery, index, all) => all.findIndex(item => item.sessionId === delivery.sessionId) === index).map(delivery => <option key={delivery.sessionId} value={delivery.sessionId}>{snapshot.messages.find(message => message.id === delivery.messageId)?.content.slice(0, 60)} · {delivery.status}</option>)}</select></label>}
        <div className="flex items-end gap-2"><textarea aria-label="Message the team" placeholder="Message the team…" value={input} onChange={event => setInput(event.target.value)} className="min-h-20 min-w-0 flex-1 resize-y rounded-lg border bg-background p-3 text-sm" maxLength={20000} />
          <Button type="submit" disabled={sending || !snapshot || !input.trim()} aria-label="Send team message"><Send className="h-4 w-4" /></Button></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  </div>
}
