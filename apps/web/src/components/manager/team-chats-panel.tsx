import { useUrlSearchState } from '@/hooks/useUrlSearchState'
import { useEffect, useRef, useState } from 'react'
import type { TeamRoom } from '@jait/shared'
import { Check, MessagesSquare, Plus, Search, X } from 'lucide-react'
import { agentsApi } from '@/lib/agents-api'
import { teamChatApi } from '@/lib/team-chat-api'
import { teamMembers } from '@/lib/agent-organization'
import type { PersonaAgentDraft } from '@/lib/persona-agents'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AgentAvatar } from './agent-avatar'
import { TeamAvatar } from './team-avatar'
import { TeamRoomView } from './team-room'

export function TeamChatsPanel({ isMobile = false, onHide }: { isMobile?: boolean; onHide?: () => void }) {
  const [rooms, setRooms] = useState<TeamRoom[]>([])
  const [agents, setAgents] = useState<PersonaAgentDraft[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(() => typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('teamRoom'))
  const [mobileList, setMobileList] = useState(!selectedId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [search, setSearch] = useUrlSearchState('agents', 'teamQ')
  const [agentSearch, setAgentSearch] = useUrlSearchState('agents', 'agentQ')
  useEffect(() => { if (agentSearch) setCreating(true) }, [agentSearch])
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const drafts = useRef(new Map<string, string>())
  const [runtime, setRuntime] = useState<{ roomId: string; runningIds: ReadonlySet<string> } | null>(null)
  const selectRoom = (id: string) => {
    setSelectedId(id); setMobileList(false)
    const url = new URL(window.location.href)
    url.searchParams.set('teamRoom', id)
    window.history.replaceState(window.history.state, '', url)
  }
  useEffect(() => {
    let active = true
    Promise.all([teamChatApi.list(), agentsApi.listPersonaAgents()]).then(([result, profiles]) => {
      if (!active) return
      setRooms(result.rooms); setAgents(profiles)
      // Opening the panel must not open a chat on its own: only a room the user
      // picked (or a deep link) becomes the selected conversation.
      setSelectedId(id => id && result.rooms.some(room => room.id === id) ? id : null)
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not load team chats') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const create = async () => {
    if (saving || !name.trim() || !memberIds.length) return
    setSaving(true); setCreateError(null)
    try {
      const { room } = await teamChatApi.create({ name: name.trim(), memberIds })
      setRooms(existing => [room, ...existing]); selectRoom(room.id); setCreating(false)
    } catch (error) { setCreateError(error instanceof Error ? error.message : 'Could not create team chat') }
    finally { setSaving(false) }
  }
  const openCreate = () => { setName(''); setMemberIds([]); setAgentSearch(''); setCreateError(null); setCreating(true) }
  const selected = rooms.find(room => room.id === selectedId)
  const membersFor = (room: TeamRoom) => room.memberIds ? agents.filter(agent => room.memberIds!.includes(agent.id)) : teamMembers(room.rootAgentId, agents)
  return <section aria-label="Team chats" className={isMobile
    ? 'flex min-h-0 min-w-0 flex-1'
    : `absolute inset-y-0 left-0 z-30 flex min-h-0 border-r bg-background shadow-2xl transition-[width] duration-200 ${selected ? 'w-[min(56rem,100%)]' : 'w-80'}`}>
    {(isMobile ? mobileList : true) && <aside aria-label="Team chats panel" className={`flex min-h-0 shrink-0 flex-col bg-background ${isMobile ? 'w-full' : `w-80 ${selected ? 'border-r' : ''}`}`}>
      <header className="flex min-h-11 items-center gap-2 border-b px-3">
        <MessagesSquare className="h-4 w-4 text-muted-foreground" /><h1 className="flex-1 text-sm font-semibold">Team Chats</h1>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="New team chat" onClick={openCreate}><Plus className="h-4 w-4" /></Button>
        {onHide && <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Hide team chats panel" onClick={onHide}><X className="h-4 w-4" /></Button>}
      </header>
      <label className="relative m-3"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><input aria-label="Search team chats" placeholder="Search team chats" value={search} onChange={event => setSearch(event.target.value)} className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-sm" /></label>
      <nav aria-label="Team chat list" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {loading && <p className="px-2 text-sm text-muted-foreground">Loading team chats…</p>}
        {error && <p role="alert" className="px-2 text-sm text-destructive">{error}</p>}
        {!loading && !error && !rooms.length && <p className="px-2 text-sm text-muted-foreground">Create a team chat and choose its agents.</p>}
        {rooms.filter(room => room.name.toLowerCase().includes(search.toLowerCase())).map(room => <button key={room.id} type="button" aria-current={selectedId === room.id ? 'page' : undefined} onClick={() => selectRoom(room.id)} className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent ${selectedId === room.id ? 'bg-accent' : ''}`}>
          <TeamAvatar members={membersFor(room)} runningIds={runtime?.roomId === room.id ? runtime.runningIds : undefined} size={32} />
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{room.name}</span><span className="block truncate text-xs text-muted-foreground">{membersFor(room).map(agent => agent.name).join(', ') || 'No members'}</span></span>
        </button>)}
      </nav>
    </aside>}
    {(!isMobile || !mobileList) && selected && <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <TeamRoomView key={selected.id} roomId={selected.id} initialIdentity={{ id: selected.id, name: selected.name, members: membersFor(selected) }} onBack={() => setMobileList(true)} backLabel="Back to team chats" showBack={isMobile} initialInput={drafts.current.get(selected.id) ?? ''} onInputChange={text => drafts.current.set(selected.id, text)} onRuntimeChange={setRuntime} />
    </div>}
    <Dialog open={creating} onOpenChange={open => { if (!saving) setCreating(open) }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Create team chat</DialogTitle><DialogDescription>Name the chat and select the agents you want to include.</DialogDescription></DialogHeader>
        <label className="space-y-1 text-sm font-medium">Chat name<input autoFocus maxLength={100} value={name} onChange={event => setName(event.target.value)} className="block h-9 w-full rounded-md border bg-background px-3" /></label>
        <fieldset className="min-w-0"><legend className="mb-2 text-sm font-medium">Agents · {memberIds.length} selected</legend>
          <input aria-label="Search agents" placeholder="Search agents" value={agentSearch} onChange={event => setAgentSearch(event.target.value)} className="mb-3 h-9 w-full rounded-md border bg-background px-3 text-sm" />
          <div className="grid max-h-[40vh] grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-4">
            {agents.filter(agent => agent.name.toLowerCase().includes(agentSearch.toLowerCase())).map(agent => {
              const checked = memberIds.includes(agent.id)
              return <button type="button" key={agent.id} aria-label={agent.name} aria-pressed={checked} onClick={() => setMemberIds(ids => checked ? ids.filter(id => id !== agent.id) : [...ids, agent.id])} className={`relative flex min-w-0 flex-col items-center gap-2 rounded-lg border p-3 hover:bg-accent ${checked ? 'border-primary bg-accent ring-1 ring-primary' : ''}`}>
                {checked && <Check className="absolute right-1 top-1 h-3 w-3 text-primary" />}<AgentAvatar avatar={agent.avatar} className="h-10 w-10" /><span className="w-full truncate text-center text-xs font-medium">{agent.name}</span>
              </button>
            })}
          </div>
          {!agents.length && <p className="text-sm text-muted-foreground">Create agents on the Agents page first.</p>}
        </fieldset>
        {createError && <p role="alert" className="text-sm text-destructive">{createError}</p>}
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setCreating(false)}>Cancel</Button><Button disabled={saving || !name.trim() || !memberIds.length || memberIds.length > 50} onClick={() => void create()}>{saving ? 'Creating…' : 'Create team chat'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
}
