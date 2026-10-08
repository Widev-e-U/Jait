import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TeamRoomMessage } from '@jait/shared'
import { ArrowLeft, ExternalLink, UsersRound } from 'lucide-react'
import { teamChatApi, type TeamRoomSnapshot } from '@/lib/team-chat-api'
import { Button } from '@/components/ui/button'
import { PromptInput, type PromptInputHandle } from '@/components/chat/prompt-input'
import type { ChatAttachment } from '@/hooks/useChat'
import { AgentAvatar } from './agent-avatar'

export function TeamMessageAvatar({ message }: { message: TeamRoomMessage }) {
  if (message.sender.kind === 'chat') return <span role="img" aria-label="Neutral chat persona" className="mt-1 h-8 w-8 shrink-0 rounded-full bg-gray-400" />
  if (message.sender.kind === 'agent') return <AgentAvatar avatar={message.sender.avatar || 'Nova'} className="h-8 w-8 shrink-0" />
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs">{message.sender.name.slice(0, 2)}</span>
}
export function TeamRoomView({ roomId, onBack }: { roomId: string; onBack: () => void }) {
  const [snapshot, setSnapshot] = useState<TeamRoomSnapshot | null>(null)
  const [input, setInput] = useState('')
  const composer = useRef<PromptInputHandle>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const messageList = useRef<HTMLDivElement>(null)
  const positionedRoom = useRef<string | null>(null)
  const retryKey = useRef<{ content: string; signature: string; key: string } | null>(null)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async () => {
      try { const next = await teamChatApi.get(roomId); if (active) { setSnapshot(next); setListError(null) } }
      catch (error) { if (active) setListError(error instanceof Error ? error.message : 'Could not load conversation') }
      finally { if (active) timer = setTimeout(() => { void refresh() }, 2000) }
    }
    setSnapshot(null)
    setInput(''); setError(null); retryKey.current = null
    void refresh()
    return () => { active = false; clearTimeout(timer) }
  }, [roomId])
  const count = snapshot?.messages.length ?? 0
  const loadedRoomId = snapshot?.room.id
  useLayoutEffect(() => {
    if (!loadedRoomId || !messageList.current) return
    if (positionedRoom.current !== loadedRoomId) {
      // Open history at the latest message before the first paint, without animation.
      messageList.current.scrollTop = messageList.current.scrollHeight
      positionedRoom.current = loadedRoomId
    } else {
      bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [count, loadedRoomId])
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
      <UsersRound className="h-6 w-6 text-muted-foreground" />
      <div className="min-w-0"><h1 className="truncate font-semibold">{snapshot?.room.name ?? 'Team conversation'}</h1>
        <p className="truncate text-xs text-muted-foreground">{snapshot?.members.map(member => member.name).join(', ')}</p></div>
    </header>
    {snapshot?.room.goal && <div className="border-b bg-muted/40 px-5 py-3 text-sm">
      <p><strong>Goal · {snapshot.room.goal.status}</strong> {snapshot.room.goal.description}</p>
      <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{snapshot.room.goal.criteria.map((criterion, index) => <li key={index}>{criterion}{snapshot.room.goal?.evidence?.[index] && <span> — {snapshot.room.goal.evidence[index]}</span>}</li>)}</ul>
    </div>}
    <div ref={messageList} className="min-h-0 flex-1 overflow-y-auto p-4" aria-label="Team conversation" role="log" aria-live="polite">
      {listError && <p role="alert" className="text-sm text-destructive">{listError}</p>}
      {snapshot && snapshot.messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Tell the team what you want to accomplish. The team will route your message to the right agent.</p>}
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
      })}</div><div ref={bottom} />
    </div>
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
