import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, ArchiveRestore, ChevronDown, Search, X } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { CenteredBadgeText } from './centered-badge-text'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useMessenger } from './messenger-provider'
import { TeamsConnectionCard } from './teams-connection-card'
import { hasServiceLogo, ServiceLogo } from './service-logo'

type ServiceState = 'connected' | 'attention' | 'offline'
type OwnState = 'online' | 'unavailable' | 'offline'

const BRAND: Record<string, { color: string; letter: string }> = {
  Teams: { color: '#5059C9', letter: 'T' },
  WhatsApp: { color: '#25D366', letter: 'W' },
  Telegram: { color: '#229ED9', letter: 'T' },
  Signal: { color: '#3A76F0', letter: 'S' },
  Discord: { color: '#5865F2', letter: 'D' },
  Slack: { color: '#4A154B', letter: 'S' },
  Matrix: { color: '#0DBD8B', letter: 'M' },
}

export function serviceBrand(service: string) {
  return BRAND[service] ?? { color: '#71717a', letter: service.slice(0, 1).toUpperCase() || '?' }
}

const STATE_LABEL: Record<ServiceState, string> = { connected: 'Connected', attention: 'Not connected', offline: 'Not connected' }

export function ServiceIcon({ service, className = 'size-7' }: { service: string; className?: string }) {
  if (hasServiceLogo(service)) return <ServiceLogo service={service} className={'shrink-0 ' + className} />
  const brand = serviceBrand(service)
  return <span aria-hidden className={'grid shrink-0 place-items-center text-xs font-bold text-white ' + className} style={{ backgroundColor: brand.color }}>{brand.letter}</span>
}

/** Your own status, shared by every bridged service because Matrix has one presence per account. */
function OwnPresenceControl({ service }: { service: string }) {
  const [state, setState] = useState<OwnState>('online')
  const [keep, setKeep] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    void fetch('/api/messenger/presence', { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error()))
      .then((body: { state?: string; keep?: boolean }) => {
        if (!live) return
        if (body.state === 'online' || body.state === 'unavailable' || body.state === 'offline') setState(body.state)
        setKeep(!!body.keep)
      })
      .catch(() => {})
    return () => { live = false }
  }, [])
  const save = useCallback(async (nextState: OwnState, nextKeep: boolean) => {
    setError('')
    const previous = { state, keep }
    setState(nextState)
    setKeep(nextKeep)
    try {
      const response = await fetch('/api/messenger/presence', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ state: nextState, keep: nextKeep }),
      })
      if (!response.ok) throw new Error()
    } catch {
      setState(previous.state)
      setKeep(previous.keep)
      setError('Could not update your status.')
    }
  }, [state, keep])
  return <div className="space-y-2 border-t pt-3">
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">My status</span>
      <Select value={state} onValueChange={value => void save(value as OwnState, keep)}>
        <SelectTrigger aria-label="My status" className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="online" className="text-xs">Available</SelectItem>
          <SelectItem value="unavailable" className="text-xs">Away</SelectItem>
          <SelectItem value="offline" className="text-xs">Appear offline</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      Keep this status
      <Switch checked={keep} onCheckedChange={value => void save(state, value)} aria-label="Keep this status" />
    </label>
    <p className="text-2xs text-muted-foreground">Applies to your Matrix account and is re-sent every minute while kept. Whether {service} mirrors it depends on the bridge.</p>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>
}

function ServicePanel({ service, state, rooms, unread }: { service: string; state: ServiceState; rooms: number; unread: number }) {
  if (service === 'Teams') return <div className="space-y-3">
    <TeamsConnectionCard />
    <OwnPresenceControl service={service} />
  </div>
  return <div className="space-y-3 text-sm">
    <h3 className="font-medium">{service}</h3>
    <p className="text-xs text-muted-foreground">{state === 'connected' ? `${rooms} ${rooms === 1 ? 'conversation' : 'conversations'} synced${unread ? `, ${unread} unread` : ''}.` : 'No conversations are syncing from this service. Check its bridge on your homeserver.'}</p>
    <OwnPresenceControl service={service} />
  </div>
}

function useServiceStates() {
  const { snapshot } = useMessenger()
  const [teamsState, setTeamsState] = useState<ServiceState | null>(null)
  useEffect(() => {
    let live = true
    const load = () => void fetch('/api/messenger/bridge-status', { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error()))
      .then((body: { bridges?: { platform: string; state: string }[] }) => {
        const teams = body.bridges?.find(bridge => bridge.platform === 'teams')
        if (live && teams) setTeamsState(teams.state === 'connected' ? 'connected' : teams.state === 'unknown' ? 'offline' : 'attention')
      })
      .catch(() => {})
    load()
    const timer = window.setInterval(load, 60_000)
    return () => { live = false; window.clearInterval(timer) }
  }, [])
  const names = [...new Set(['Teams', ...snapshot.rooms.filter(room => room.membership === 'join').map(room => room.service)])]
  const synced = snapshot.status === 'ready' || snapshot.status === 'syncing'
  return names.map(name => {
    const rooms = snapshot.rooms.filter(room => room.service === name && room.membership === 'join')
    const unread = rooms.reduce((sum, room) => sum + (room.unread || 0) + (room.markedUnread ? 1 : 0), 0)
    const state: ServiceState = name === 'Teams' && teamsState ? teamsState : synced && rooms.length ? 'connected' : 'offline'
    return { name, rooms: rooms.length, unread, state }
  })
}

/**
 * The one and only messenger header row: icon-only search toggle, All chats / Connections buttons, connected
 * provider icons with unread badges on the right, and a hidden-chats button at the end.
 * Tapping the selected provider opens its settings popover (which also resets the filter).
 */
export function MessengerHeaderBar({ service, onService, hiddenOpen, hiddenCount, onToggleHidden, onOptions, search, onSearch }: {
  service: string
  onService: (service: string) => void
  hiddenOpen: boolean
  hiddenCount: number
  onToggleHidden: () => void
  onOptions: () => void
  search: string
  onSearch: (value: string) => void
}) {
  const items = useServiceStates()
  const [searching, setSearching] = useState(!!search)
  const [configure, setConfigure] = useState<string | null>(null)
  const active = !!search.trim()
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (searching) inputRef.current?.focus() }, [searching])
  const icon = 'relative grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted'
  const badge = (count: number, tone = 'bg-primary text-primary-foreground') => count > 0 && (
    <span aria-label={`${count} unread`} className={'absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-center text-[10px] font-semibold tabular-nums ring-2 ring-background ' + tone}>
      <CenteredBadgeText text={count > 99 ? '99+' : count} />
    </span>
  )

  return <div role="group" aria-label="Services and search" className="flex h-11 shrink-0 items-center gap-1 border-b bg-background pl-0.5 pr-1.5">
    <div role="search" className={'flex min-w-0 items-center overflow-hidden transition-[flex-grow] duration-300 ease-out ' + (searching ? 'grow' : 'grow-0')}>
      <button
        type="button"
        aria-label={searching ? 'Collapse search' : active ? 'Search (search filter active)' : 'Search'}
        aria-expanded={searching}
        onClick={() => setSearching(!searching)}
        className={icon + (searching ? ' text-foreground' : active ? ' text-primary' : '')}
      >
        <Search className="h-4 w-4" />
        {active && <span aria-hidden className="absolute right-0.5 top-0.5 size-2 rounded-full bg-primary ring-2 ring-background" />}
      </button>
      <div className={'flex min-w-0 items-center transition-[max-width,opacity] duration-300 ease-out ' + (searching ? 'max-w-full flex-1 opacity-100' : 'pointer-events-none max-w-0 opacity-0')}>
        <Input
          ref={inputRef}
          aria-label="Search conversations and messages"
          placeholder="Search"
          tabIndex={searching ? 0 : -1}
          value={search}
          onChange={event => onSearch(event.target.value)}
          onKeyDown={event => { if (event.key === 'Escape') setSearching(false) }}
          className="h-9 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
        />
        {active && <button type="button" aria-label="Clear search" onClick={() => onSearch('')} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>}
      </div>
    </div>
    <div className={'flex shrink-0 items-center gap-1 overflow-hidden transition-[max-width,opacity] duration-300 ease-out ' + (searching ? 'pointer-events-none max-w-0 opacity-0' : 'max-w-[16rem] opacity-100')}>
      <button type="button" tabIndex={searching ? -1 : 0} aria-pressed={service === 'All'} onClick={() => onService('All')}
        className={'h-7 whitespace-nowrap rounded-md border px-2 text-xs font-medium hover:bg-muted ' + (service === 'All' ? 'bg-secondary' : '')}>All chats</button>
      <button type="button" tabIndex={searching ? -1 : 0} onClick={onOptions}
        className="h-7 whitespace-nowrap rounded-md border px-2 text-xs font-medium hover:bg-muted">Connections</button>
    </div>
    <div role="tablist" aria-label="Filter by service" className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto py-1">
      {items.map(({ name, rooms, unread, state }) => {
        const selected = service === name
        const trigger = <button type="button" role="tab" aria-selected={selected} aria-label={`${name}: ${STATE_LABEL[state]}`}
          onClick={() => { if (selected) setConfigure(name); else onService(name) }}
          className={'relative grid h-8 w-8 shrink-0 place-items-center rounded-full ' + (selected ? 'bg-secondary ring-1 ring-border' : '')}>
          <ServiceIcon service={name} className="size-6 rounded-full" />
          {badge(unread)}
        </button>
        return <Popover key={name} open={configure === name} onOpenChange={open => setConfigure(open && selected ? name : null)}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent align="end" className="w-[min(20rem,calc(100vw-1rem))]">
            <ServicePanel service={name} state={state} rooms={rooms} unread={unread} />
          </PopoverContent>
        </Popover>
      })}
    </div>
    <button
      type="button"
      aria-label={hiddenOpen ? 'Back to all chats' : `Hidden chats (${hiddenCount})`}
      aria-pressed={hiddenOpen}
      onClick={onToggleHidden}
      className={icon + (hiddenOpen ? ' text-foreground' : '')}
    >
      {hiddenOpen ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
      {badge(hiddenCount, 'bg-muted text-muted-foreground')}
    </button>
  </div>
}

export type ChatFilter = 'all' | 'unread' | 'direct' | 'groups'
const EXTRA_FILTERS: { value: 'direct' | 'groups'; label: string }[] = [{ value: 'direct', label: 'Direct' }, { value: 'groups', label: 'Groups' }]

/** Compact second header row with quick list filters, similar to WhatsApp. */
export function MessengerFilterBar({ filter, onFilter, unreadCount }: { filter: ChatFilter; onFilter: (filter: ChatFilter) => void; unreadCount: number }) {
  const chip = (active: boolean) => 'h-6 shrink-0 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium hover:bg-muted ' + (active ? 'border-primary/40 bg-primary/15 text-primary' : 'text-muted-foreground')
  const extra = EXTRA_FILTERS.find(item => item.value === filter)
  return <div role="group" aria-label="Filter conversations" className="flex h-9 shrink-0 items-center gap-1.5 overflow-x-auto border-b bg-background px-2">
    <button type="button" aria-pressed={filter === 'all'} onClick={() => onFilter('all')} className={chip(filter === 'all')}>All</button>
    <button type="button" aria-pressed={filter === 'unread'} onClick={() => onFilter('unread')} className={chip(filter === 'unread')}>Unread{unreadCount > 0 ? ` ${unreadCount}` : ''}</button>
    {extra && <button type="button" aria-pressed onClick={() => onFilter('all')} className={chip(true)}>{extra.label}<X className="ml-1 inline h-3 w-3" aria-hidden /></button>}
    <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" aria-label="More filters" className={chip(false) + ' grid place-items-center px-1.5'}><ChevronDown className="h-3.5 w-3.5" /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {EXTRA_FILTERS.map(item => <DropdownMenuItem key={item.value} onSelect={() => onFilter(item.value)}>{item.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
}
