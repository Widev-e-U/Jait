import { toast } from 'sonner'
import { useUrlSearchState } from '@/hooks/useUrlSearchState'
import { automaticReadAllowed } from '@/lib/messenger/notification-actions'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ChevronDown, Loader2, LockKeyhole, MessageCircle, MoreHorizontal, Search, Settings2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Conversation } from '@/components/chat/conversation'
import { MessengerBubble } from './messenger-message'
import { MessengerStatusView } from './messenger-status-view'
import { MessengerOptions } from './messenger-options'
import { dayDividerLabel, needsDayDivider } from '@/lib/messenger/dates'
import { messageGroupPositions } from '@/lib/messenger/grouping'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { useConfirmDialog } from '@/components/ui/confirm-dialog'
import { PromptInput, type PromptInputHandle } from '@/components/chat/prompt-input'
import { ChatComposerSurface } from '@/components/chat/chat-composer-surface'
import { useVoiceRecording } from '@/hooks/useVoiceRecording'
import type { SttProvider } from '@/hooks/useAuth'
import { appendTranscript } from '@/lib/transcript-merge'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useMessenger } from './messenger-provider'
import { MAX_ATTACHMENT_BYTES, isStatusRoom, messengerError, presenceLabel, type MessengerRoom } from '@/lib/messenger/model'
import { chatListAvatarProps } from '@/lib/messenger/room-avatar'
import { MessengerPeerAvatar } from './messenger-peer'
import { CenteredBadgeText } from './centered-badge-text'
import { TooltipHint } from '@/components/ui/tooltip'

function ConnectionForm() {
  const { store, snapshot } = useMessenger()
  const [homeserver, setHomeserver] = useUrlSearchState('messenger', 'homeserver')
  const [username, setUsername] = useUrlSearchState('messenger', 'username')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [useToken, setUseToken] = useState(false)
  const busy = snapshot.status === 'connecting' || snapshot.status === 'syncing'
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const input = { homeserver, username, password, accessToken: useToken ? token : undefined }
    setPassword('')
    setToken('')
    await store.connect(input)
  }
  return <div className="m-auto w-full max-w-lg space-y-6 p-5 sm:p-8">
    <div className="space-y-2">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MessageCircle className="h-6 w-6" /></div>
      <h2 className="text-xl font-semibold">All your conversations, together</h2>
      <p className="text-sm text-muted-foreground">Connect a Matrix account to read and reply to your conversations here. Your server’s bridges bring in your other messaging accounts.</p>
    </div>
    <form className="space-y-4" onSubmit={event => void submit(event)}>
      <label className="block space-y-1.5 text-sm">Homeserver URL<Input type="url" placeholder="https://matrix.example.com" value={homeserver} onChange={event => setHomeserver(event.target.value)} required autoComplete="url" disabled={busy} /></label>
      {useToken ? <label className="block space-y-1.5 text-sm">Device access token<Input type="password" value={token} onChange={event => setToken(event.target.value)} required autoComplete="off" disabled={busy} /></label> : <>
        <label className="block space-y-1.5 text-sm">Matrix username<Input value={username} onChange={event => setUsername(event.target.value)} placeholder="@you:example.com" required autoComplete="username" disabled={busy} /></label>
        <label className="block space-y-1.5 text-sm">Matrix password<Input type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" disabled={busy} /></label>
      </>}
      {snapshot.error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{snapshot.error}</p>}
      <Button type="submit" className="w-full gap-2" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? 'Connecting…' : 'Connect Matrix'}</Button>
      <button type="button" className="text-xs text-muted-foreground underline" disabled={busy} onClick={() => { setUseToken(!useToken); setPassword(''); setToken('') }}>{useToken ? 'Use a password instead' : 'Use a device access token (SSO accounts)'}</button>
    </form>
    {(busy || snapshot.error) && <Button variant="outline" size="sm" onClick={() => void store.disconnect().catch(() => {})}>{busy ? 'Cancel connection' : 'Clear saved connection'}</Button>}
    <p className="text-xs text-muted-foreground">Your password is never saved. Your gateway keeps one Matrix connection and its encryption keys for all your signed-in Jait devices. Messages are not sent to AI unless you enable assistant access in Connections.</p>
    <details className="rounded-lg border p-4 text-sm">
      <summary className="cursor-pointer font-medium">Need a Matrix server?</summary>
      <p className="mt-3 text-muted-foreground">Use an existing homeserver, or run Jait’s optional Synapse deployment. It runs separately and keeps working when Jait is closed.</p>
      <a className="mt-2 inline-block underline" href="https://github.com/Widev-e-U/Jait/blob/main/docs/messenger.md" target="_blank" rel="noreferrer">Self-hosting and bridge setup</a>
    </details>
  </div>
}

export default function MessengerPage({ token = null, sttProvider = 'whisper' }: { token?: string | null; sttProvider?: SttProvider }) {
  const { store, snapshot } = useMessenger()
  const confirm = useConfirmDialog()
  const historyBusy = useRef(false)
  const historyErrorToast = useRef<string | number | undefined>(undefined)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyFailedRoom, setHistoryFailedRoom] = useState<string | null>(null)
  // Messenger options are their own pane, not a drawer sliding over the conversation list.
  const [pane, setPane] = useUrlSearchState('messenger', 'pane')
  const optionsOpen = pane === 'options'
  // One search field drives conversations, loaded-message results, and the open conversation.
  // Older links that used `messageQ` still restore their query.
  const [search, setSearch] = useUrlSearchState('messenger', 'q', () => new URLSearchParams(window.location.search).get('messageQ') ?? '')
  const [serviceValue, setService] = useUrlSearchState('messenger', 'service')
  const service = serviceValue || 'All'
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (snapshot.error) toast.error(snapshot.error, { id: 'messenger-connection-error' })
    else toast.dismiss('messenger-connection-error')
  }, [snapshot.error])
  const composerRef = useRef<PromptInputHandle>(null)
  const mobile = useIsMobile()
  const roomId = snapshot.selectedRoomId
  const room = snapshot.rooms.find(room => room.id === roomId)
  const statusRoom = !!room && (room.status || room.kind === 'status' || isStatusRoom(room))
  const draft = roomId ? drafts[roomId] ?? '' : ''
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const { voiceRecording, voiceTranscribing, voiceLevels, handleVoiceInput, stopRecordingAndTranscribe } = useVoiceRecording({
    token,
    activeSessionId: 'messenger-dictation',
    sttProvider,
    // Every recording supplies its own room-bound target below.
    setInputValue: () => {},
    onAuthRequired: () => toast.error('Sign in to Jait to use dictation.'),
  })
  const dictate = () => {
    if (!roomId || !ready || busy || voiceRecording || voiceTranscribing) return
    const target = roomId
    const session = snapshot.session
    void handleVoiceInput({ onTranscript: text => {
      if (!mounted.current || store.getSnapshot().session !== session) return
      setDrafts(current => ({ ...current, [target]: appendTranscript(current[target] ?? '', text) }))
    } })
  }
  const ready = snapshot.status === 'ready'
  const connected = !!snapshot.session
  const services = ['All', ...new Set([...snapshot.rooms.map(room => room.service), ...(service !== 'All' ? [service] : [])])]
  const messages = snapshot.messages.filter(message => !search || (!message.unableToDecrypt && message.body.toLowerCase().includes(search.toLowerCase())))
  // Consecutive messages from the same sender render as one run: one avatar, tighter spacing.
  const groupPositions = messageGroupPositions(messages)
  // Message hits are independent of the conversation-name filter: only the service filter narrows them.
  const searchResults = store.searchLoadedMessages(search).filter(item => service === 'All' || snapshot.rooms.some(room => room.id === item.roomId && room.service === service))
  const rooms = snapshot.rooms.filter(room => (service === 'All' || room.service === service) && (room.name + ' ' + room.network + ' ' + (room.team ?? '')).toLowerCase().includes(search.toLowerCase()))
  // Teams (Matrix spaces or bridge workspaces) group their channels instead of listing them flat.
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(() => new Set())
  const toggleTeam = (name: string) => setCollapsedTeams(current => {
    const next = new Set(current)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    return next
  })
  const teams = new Map<string, { hub: MessengerRoom | null; channels: MessengerRoom[] }>()
  for (const room of rooms) if (room.kind === 'team') teams.set(room.name, { hub: room, channels: [] })
  for (const room of rooms) {
    if (room.kind !== 'channel') continue
    const name = room.team ?? room.network ?? 'Channels'
    const entry = teams.get(name) ?? { hub: null, channels: [] }
    entry.channels.push(room)
    teams.set(name, entry)
  }
  const chatRooms = rooms.filter(room => room.kind !== 'channel' && room.kind !== 'team')
  const roomRow = (item: MessengerRoom, channel = false) => (
    <div key={item.id} role="group" aria-label={'Conversation ' + item.name} data-room-kind={item.kind ?? 'chat'} className={'group/room flex min-w-0 items-center border-b border-border/50 ' + (item.id === roomId ? 'bg-secondary' : 'hover:bg-muted/60 [&:has([data-state=open])]:bg-muted/60')}>
      <button onClick={() => selectRoom(item.id)} aria-pressed={item.id === roomId} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-1.5 text-left">
        <MessengerPeerAvatar size="md" showPresence={false} {...chatListAvatarProps(item, channel)} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium leading-4">{channel ? '#' + item.name : item.name}</span>
            <TooltipHint content={[item.service, item.team || item.network, item.membership === 'invite' ? 'Invitation' : ''].filter(Boolean).join(' · ')}>
              <span className="max-w-[55%] shrink-0 truncate text-2xs leading-4 text-muted-foreground">
                {item.service}{item.team || item.network ? ' · ' + (item.team || item.network) : ''}{item.membership === 'invite' ? ' · Invitation' : ''}
              </span>
            </TooltipHint>
          </span>
          <span className="mt-0.5 block truncate text-xs leading-4 text-muted-foreground">{item.preview}</span>
        </span>
        {(item.unread > 0 || item.markedUnread) && <span aria-label={item.unread > 0 ? `${item.unread} unread messages` : 'Unread'} className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-center text-[10px] font-semibold text-primary-foreground tabular-nums"><CenteredBadgeText text={item.unread > 99 ? '99+' : item.unread || '•'} /></span>}
      </button>
      {roomMenu(item, 'Options for ' + item.name, true)}
    </div>
  )

  useEffect(() => {
    const selectFromUrl = () => {
      const params = new URLSearchParams(window.location.search)
      if (params.get('action') === 'mark-read') return
      const id = params.get('roomId')
      store.selectRoom(id)
    }
    selectFromUrl()
    window.addEventListener('popstate', selectFromUrl)
    return () => window.removeEventListener('popstate', selectFromUrl)
  }, [store])

  useEffect(() => {
    store.setVisibleRoom(roomId)
    let cancelled = false
    const markRead = () => {
      void automaticReadAllowed().then(allowed => {
        if (!cancelled && ready && room && !statusRoom && allowed && document.visibilityState === 'visible' && document.hasFocus()) return store.markRead(roomId, undefined, true)
      }).catch(() => {})
    }
    markRead()
    window.addEventListener('focus', markRead)
    document.addEventListener('visibilitychange', markRead)
    return () => {
      cancelled = true
      store.setVisibleRoom(null)
      window.removeEventListener('focus', markRead)
      document.removeEventListener('visibilitychange', markRead)
    }
  }, [store, roomId, room?.id, snapshot.messages.at(-1)?.id, ready, statusRoom])

  useEffect(() => {
    if (!snapshot.session) setDrafts({})
  }, [snapshot.session])
  const act = async (action: () => Promise<unknown>, errorText?: string) => {
    setBusy(true)
    try { await action() }
    catch (error) { toast.error(errorText ?? messengerError(error)) }
    finally { setBusy(false) }
  }
  const selectRoom = (id: string | null) => {
    store.selectRoom(id)
    setHistoryFailedRoom(null)
    if (historyErrorToast.current !== undefined) toast.dismiss(historyErrorToast.current)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('roomId', id)
    else url.searchParams.delete('roomId')
    window.history.replaceState(null, '', url.pathname + url.search)
  }
  const send = () => {
    if (!roomId || !draft.trim() || busy || !ready) return
    const target = roomId
    const text = draft
    const composer = composerRef.current
    // Clear the composer right away: the pending message is rendered from the
    // store's local echo, so waiting for the gateway would only look laggy.
    const sending = store.send(target, text)
    composer?.reset()
    setDrafts(current => ({ ...current, [target]: current[target] === text ? '' : current[target] }))
    void sending.catch(error => {
      toast.error(messengerError(error))
      setDrafts(current => ({ ...current, [target]: current[target] || text }))
    })
  }

  const loadEarlier = async (target = roomId) => {
    if (historyBusy.current || !ready || !target || store.getSnapshot().selectedRoomId !== target) return
    historyBusy.current = true
    setLoadingHistory(true)
    try {
      await store.loadEarlier()
      setHistoryFailedRoom(null)
      if (historyErrorToast.current !== undefined) toast.dismiss(historyErrorToast.current)
    } catch {
      // Pause automatic pagination until an explicit retry; repeated failures
      // must not keep fetching or flood the user with notifications.
      setHistoryFailedRoom(target)
      historyErrorToast.current = toast.error('Could not load earlier messages. Please try again.', {
        duration: Infinity,
        action: { label: 'Retry', onClick: () => void loadEarlier(target) },
      })
    }
    finally { historyBusy.current = false; setLoadingHistory(false) }
  }
  const roomMenu = (item: MessengerRoom, label: string, inList = false) => <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className={'mr-1 h-8 w-8 shrink-0 hover:text-foreground data-[state=open]:text-foreground ' + (inList ? 'bg-transparent hover:bg-transparent data-[state=open]:bg-transparent' : 'hover:bg-muted focus-visible:bg-muted data-[state=open]:bg-muted')} aria-label={label} disabled={!ready || busy}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {item.membership === 'join' && <DropdownMenuItem onSelect={() => void act(async () => {
        if (item.unread > 0 || item.markedUnread) await store.markRead(item.id)
        else { await store.markUnread(item.id); if (roomId === item.id) selectRoom(null) }
      })}>Mark as {item.unread > 0 || item.markedUnread ? 'read' : 'unread'}</DropdownMenuItem>}
      <DropdownMenuItem onSelect={() => { selectRoom(mobile ? null : item.id); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[aria-label="Search conversations and messages"]')?.focus()) }}>Search messages</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => void act(() => navigator.clipboard.writeText(item.id))}>Copy conversation ID</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={!store.remove} className="text-destructive" onSelect={() => { void (async () => {
        if (!await confirm({ title: 'Remove conversation?', description: 'This will leave this Matrix conversation and remove it from your inbox. Other participants keep their messages. You may need a new invitation to rejoin.', confirmLabel: 'Remove', variant: 'destructive' })) return
        await act(async () => { await store.remove!(item.id); if (roomId === item.id) selectRoom(null) })
      })() }}>Remove conversation</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

  return <section aria-label="Messenger" className="flex h-full min-h-0 w-full flex-col bg-background">
    {/* No page title chrome: the conversation list toolbar is the only header the page needs.
        Status stays in the tree so screen readers still get the connection state. */}
    <span role="status" className="sr-only">{snapshot.status === 'ready' ? 'Connected' : snapshot.status === 'disconnected' ? 'Matrix' : snapshot.status}</span>
    {!connected ? <div className="flex min-h-0 flex-1 overflow-y-auto"><ConnectionForm /></div>
      : optionsOpen ? <MessengerOptions onBack={() => setPane('')} onOpenConversation={id => { selectRoom(id); setPane('') }} />
      : <>
      <div className="flex min-h-0 flex-1">
        <aside aria-label="Conversations" className={(roomId ? 'hidden md:flex ' : 'flex ') + 'w-full shrink-0 flex-col border-r md:w-72 lg:w-80'}>
          <div className="flex h-14 shrink-0 items-center gap-2 border-b px-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search conversations and messages" placeholder="Search" value={search} onChange={event => setSearch(event.target.value)} className="h-9 pl-8 pr-8 text-sm" />
              {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
            </div>
            <Select value={service} onValueChange={value => setService(value === 'All' ? '' : value)}>
              <SelectTrigger aria-label="Filter by service" className="h-9 w-auto max-w-[9rem] shrink-0 gap-1.5 px-2.5 text-xs font-medium"><SelectValue /></SelectTrigger>
              <SelectContent align="end" className="min-w-[8rem]">{services.map(item => <SelectItem key={item} value={item} className="text-xs">{item}</SelectItem>)}</SelectContent>
            </Select>
            <TooltipHint content="Connections"><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setPane('options')} aria-label="Connections"><Settings2 className="h-4 w-4" /></Button></TooltipHint>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {search && <div aria-label="Message search results" className="border-b">
              {searchResults.map(item => <button key={item.roomId + item.message.id} onClick={() => selectRoom(item.roomId)} className="block w-full space-y-1 border-b p-3 text-left text-sm hover:bg-muted/60"><span className="block truncate font-medium">{item.roomName}</span><span className="line-clamp-2 break-words text-xs text-muted-foreground">{item.message.body.slice(0, 300)}</span></button>)}
              {searchResults.length === 0 && <p className="p-3 text-sm text-muted-foreground">No matching loaded messages.</p>}
              <p className="px-3 py-1.5 text-2xs text-muted-foreground">Loaded, decrypted history only. Up to 50 rooms and 50 results.</p>
            </div>}
            {[...teams.entries()].map(([name, entry]) => {
              const unread = entry.channels.reduce((sum, item) => sum + (item.unread || 0) + (item.markedUnread ? 1 : 0), 0)
              const collapsed = collapsedTeams.has(name)
              return <div key={'team:' + name} data-team-section={name} className="border-b border-border/50">
                <button type="button" onClick={() => toggleTeam(name)} aria-expanded={!collapsed} aria-label={'Team ' + name} className="flex w-full min-w-0 items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted/50">
                  <MessengerPeerAvatar
                    name={name}
                    size="md"
                    rounded="lg"
                    showPresence={false}
                    {...(entry.hub?.avatarUrl ? { mxcUrl: entry.hub.avatarUrl } : {})}
                  />
                  <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{name}</span><span className="flex items-center gap-2">{unread > 0 && <span aria-label={`${unread} unread messages`} className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-center text-[10px] font-semibold text-primary-foreground tabular-nums"><CenteredBadgeText text={unread > 99 ? '99+' : unread} /></span>}<ChevronDown className={'h-4 w-4 text-muted-foreground transition-transform ' + (collapsed ? '-rotate-90' : '')} /></span></span><span className="block truncate text-2xs text-muted-foreground">{entry.hub?.service ?? entry.channels[0]?.service ?? 'Team'} · {entry.channels.length} {entry.channels.length === 1 ? 'channel' : 'channels'}</span></span>
                </button>
                {!collapsed && entry.channels.map(channel => roomRow(channel, true))}
              </div>
            })}
            {chatRooms.map(item => roomRow(item))}
            {rooms.length === 0 && <div className="space-y-2 p-5 text-sm text-muted-foreground"><p>{snapshot.rooms.length ? 'No matching conversations.' : 'Your conversations will appear here as Matrix syncs.'}</p>{!snapshot.rooms.length && <Button variant="outline" size="sm" onClick={() => setPane('options')}>Connect a bridge</Button>}</div>}
          </div>
        </aside>
        <main onPointerDown={() => { if (roomId && room && !statusRoom && document.hasFocus()) void store.markRead(roomId).catch(() => {}) }} onKeyDown={() => { if (roomId && room && !statusRoom && document.hasFocus()) void store.markRead(roomId).catch(() => {}) }} className={(roomId ? 'flex ' : 'hidden md:flex ') + 'min-h-0 min-w-0 flex-1 flex-col'}>
          {!room ? <div className="m-auto max-w-sm space-y-2 p-6 text-center text-muted-foreground"><MessageCircle className="mx-auto h-10 w-10 text-primary/60" /><h2 className="font-medium text-foreground">Your personal inbox</h2><p className="text-sm">{roomId ? 'Waiting for this conversation to sync. Use Back to choose another.' : 'Choose a conversation to read and reply as yourself.'}</p>{roomId && <Button variant="outline" size="sm" onClick={() => selectRoom(null)}>Back to conversations</Button>}</div> : <>
            <div className="flex h-14 shrink-0 items-center gap-3 border-b px-3"><Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => selectRoom(null)} aria-label="Back to conversations"><ArrowLeft className="h-4 w-4" /></Button><MessengerPeerAvatar name={room.peer?.name || room.name} mxcUrl={room.peer?.avatarUrl ?? room.avatarUrl} presence={room.peer?.presence} /><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{room.kind === 'channel' ? '#' + room.name : room.name}</h2><p className="truncate text-xs text-muted-foreground">{room.kind === 'channel' ? [room.team, room.service].filter(Boolean).join(' · ') : [presenceLabel(room.peer?.presence, room.peer?.lastActiveAgo), room.service, room.network].filter(Boolean).join(' · ')}</p></div>{roomMenu(room, 'Conversation options')}{room.encrypted && <TooltipHint content="Encrypted Matrix room"><span><LockKeyhole className="h-4 w-4 text-muted-foreground" aria-label="Encrypted room" /></span></TooltipHint>}</div>
            {room.kind === 'channel' && room.topic && <p data-channel-topic className="truncate border-b bg-muted/30 px-3 py-1 text-xs text-muted-foreground">{room.topic}</p>}
            {search && <div role="status" className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-3 py-1 text-xs text-muted-foreground"><span className="truncate">Showing {messages.length} matching {messages.length === 1 ? 'message' : 'messages'}</span><button type="button" className="ml-auto shrink-0 underline" onClick={() => setSearch('')}>Clear search</button></div>}
            {room.membership === 'invite' ? <div className="m-auto space-y-4 p-6 text-center"><p>You have been invited to this conversation.</p><div className="flex justify-center gap-2"><Button disabled={!ready || busy} onClick={() => void act(() => store.join(room.id))}>Accept invitation</Button><Button variant="outline" disabled={!ready || busy} onClick={() => void act(() => store.leave(room.id))}>Decline</Button></div></div> : statusRoom ? <MessengerStatusView key={room.id} messages={messages} hasEarlier={!!snapshot.hasEarlier && ready} loadingEarlier={loadingHistory} onLoadEarlier={() => void loadEarlier()} /> : <>
              <Conversation
                key={room.id}
                variant="messenger"
                mobile={mobile}
                messageContents={messages.map(message => message.body)}
                messageEstimateInputs={messages.map(message => ({ content: message.body, role: message.own ? 'user' : 'assistant' }))}
                hasMore={ready && !loadingHistory && historyFailedRoom !== room.id && !!snapshot.hasEarlier}
                onLoadMore={() => void loadEarlier()}
              >
                {messages.map((message, index) => <div key={message.id} className={groupPositions[index]?.end === false ? 'pb-1.5' : 'pb-3'}>
                  {needsDayDivider(messages[index - 1]?.timestamp, message.timestamp) && <p data-day-divider className="mx-auto my-2 w-fit rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">{dayDividerLabel(message.timestamp)}</p>}
                  <MessengerBubble
                    messageId={message.id} message={message} roomId={room.id} disabled={!ready || busy}
                    variant={room.kind === 'channel' ? 'channel' : 'chat'}
                    groupStart={groupPositions[index]?.start ?? true}
                    groupEnd={groupPositions[index]?.end ?? true}
                    {...(room.peer ? { avatar: { name: room.peer.name, presence: room.peer.presence, ...(room.peer.avatarUrl ? { mxcUrl: room.peer.avatarUrl } : {}) } } : {})}
                  />
                </div>)}
              </Conversation>
              {loadingHistory && <p role="status" className="px-3 py-1 text-xs text-muted-foreground">Loading earlier messages…</p>}
              {snapshot.historyLimited && <p role="status" className="px-3 py-1 text-xs text-muted-foreground">10,000 events loaded. Open WhatsApp for older history.</p>}
              <ChatComposerSurface className="shrink-0 px-3 pb-3">
                <div className="mx-auto max-w-4xl">
                  <PromptInput
                    key={room.id}
                    ref={composerRef}
                    variant="messenger"
                    value={draft}
                    onChange={value => setDrafts(current => ({ ...current, [room.id]: value }))}
                    onSubmit={send}
                    clearOnSubmit={false}
                    disabled={!ready || busy}
                    submitLoading={busy}
                    placeholder="Write a message…"
                    onVoiceInput={dictate}
                    onVoiceStop={() => void stopRecordingAndTranscribe()}
                    voiceRecording={voiceRecording}
                    voiceTranscribing={voiceTranscribing}
                    voiceLevels={voiceLevels}
                    onFilesSelected={files => {
                      if (!ready || busy) return
                      if (files.some(file => file.size > MAX_ATTACHMENT_BYTES)) {
                        toast.error('Attachment exceeds 20 MB.')
                        return
                      }
                      // Upload without the global busy lock: the store renders
                      // each file as a pending message, so the composer stays
                      // usable while the bytes are in flight.
                      void (async () => {
                        try { for (const file of files) await store.sendAttachment(room.id, file) }
                        catch (error) { toast.error(messengerError(error)) }
                      })()
                    }}
                  />
                </div>
              </ChatComposerSurface>
            </>}
          </>}
        </main>
      </div>
    </>}
  </section>
}
