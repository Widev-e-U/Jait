import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, List, Loader2, RefreshCw, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { calendarApi, type CalendarAccount, type CalendarEvent } from '@/lib/calendar-api'
import { isDeviceCalendarAvailable, readDeviceCalendarSnapshot } from '@/lib/device-calendar'
import { cn } from '@/lib/utils'
import { TooltipHint } from '@/components/ui/tooltip'

type ViewMode = 'list' | 'month'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function formatEventTime(event: CalendarEvent): string {
  const start = new Date(event.start)
  if (event.allDay) return start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  return start.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

interface MonthGrid {
  label: string
  cells: (Date | null)[]
}

function buildMonthGrid(cursor: Date): MonthGrid {
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const leading = first.getDay() // 0 = Sunday
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7
  const cells: (Date | null)[] = []
  for (let i = 0; i < leading; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day))
  while (cells.length < totalCells) cells.push(null)
  return { label: first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), cells }
}

export function CalendarPage() {
  const [accounts, setAccounts] = useState<CalendarAccount[]>([])
  const [accountId, setAccountId] = useState('')
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [view, setView] = useState<ViewMode>('list')
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
  const isAndroid = isDeviceCalendarAvailable()

  const loadAccounts = useCallback(async () => {
    const next = await calendarApi.accounts()
    setAccounts(next)
    setAccountId((current) => current && next.some((account) => account.id === current) ? current : (next[0]?.id ?? ''))
    return next
  }, [])

  const loadEvents = useCallback(async (selectedAccountId: string) => {
    if (!selectedAccountId) {
      setEvents([])
      return
    }
    let timeMin: Date
    let timeMax: Date
    if (view === 'month') {
      timeMin = startOfMonth(monthCursor)
      timeMax = addMonths(timeMin, 1)
    } else {
      const now = new Date()
      timeMin = now
      timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    }
    setEvents(await calendarApi.events({ accountId: selectedAccountId, timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), limit: 500 }))
  }, [view, monthCursor])

  useEffect(() => {
    void loadAccounts().catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to load calendars')).finally(() => setLoading(false))
  }, [loadAccounts])

  useEffect(() => {
    if (!accountId) return
    setLoading(true)
    void loadEvents(accountId).catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to load events')).finally(() => setLoading(false))
  }, [accountId, loadEvents])

  const syncAndroid = useCallback(async () => {
    if (!isAndroid) return
    setSyncing(true)
    try {
      const now = Date.now()
      const snapshot = await readDeviceCalendarSnapshot(now - 30 * 86400000, now + 90 * 86400000)
      const account = await calendarApi.syncDevice(snapshot)
      await loadAccounts()
      setAccountId(account.id)
      await loadEvents(account.id)
      toast.success(`Synced ${snapshot.events.length} device calendar events`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Device calendar sync failed')
    } finally {
      setSyncing(false)
    }
  }, [isAndroid, loadAccounts, loadEvents])

  const selectedAccount = useMemo(() => accounts.find((account) => account.id === accountId), [accountId, accounts])

  const month = useMemo(() => buildMonthGrid(monthCursor), [monthCursor])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const key = new Date(event.start).toDateString()
      const list = map.get(key) ?? []
      list.push(event)
      map.set(key, list)
    }
    return map
  }, [events])

  const goToToday = useCallback(() => setMonthCursor(startOfMonth(new Date())), [])
  const shiftMonth = useCallback((amount: number) => setMonthCursor((cursor) => addMonths(cursor, amount)), [])

  const todayKey = new Date().toDateString()

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><CalendarDays className="h-5 w-5" />Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Upcoming events available to you, agents, and scheduled jobs.</p>
        </div>
        {isAndroid && (
          <Button onClick={() => void syncAndroid()} disabled={syncing}>
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Smartphone className="mr-2 h-4 w-4" />}
            Sync Samsung calendar
          </Button>
        )}
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Choose a calendar source" /></SelectTrigger>
          <SelectContent>
            {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.displayName || account.email}</SelectItem>)}
          </SelectContent>
        </Select>
        {selectedAccount && <Badge variant="outline">{selectedAccount.provider === 'android' ? 'Samsung / Android - read-only' : 'Google - read-only'}</Badge>}
        <div className="flex items-center rounded-md border bg-muted p-0.5">
          <Button variant={view === 'list' ? 'default' : 'ghost'} size="sm" className="h-7 px-2.5" onClick={() => setView('list')}>
            <List className="h-4 w-4" /> List
          </Button>
          <Button variant={view === 'month' ? 'default' : 'ghost'} size="sm" className="h-7 px-2.5" onClick={() => setView('month')}>
            <CalendarDays className="h-4 w-4" /> Calendar
          </Button>
        </div>
        <Button variant="ghost" size="icon" disabled={!accountId || loading} onClick={() => void loadEvents(accountId)} aria-label="Refresh events">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </Card>

      {accounts.length === 0 && !loading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {isAndroid ? 'Tap Sync Samsung calendar and allow calendar access, or connect Google Calendar in Settings.' : 'Connect Google Calendar in Settings, or sync Samsung Calendar from the Android app.'}
        </Card>
      ) : view === 'month' ? (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b p-3">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
              <span className="min-w-[9rem] text-center text-sm font-semibold">{month.label}</span>
              <Button variant="ghost" size="icon" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <Button variant="outline" size="sm" onClick={goToToday}>Today</Button>
          </div>
          <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">
            {WEEKDAYS.map((day) => (
              <div key={day} className="border-r py-2 last:border-r-0">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {month.cells.map((day, index) => {
              if (!day) return <div key={`empty-${index}`} className="min-h-24 border-b border-r bg-muted/30 last:border-r-0" />
              const key = day.toDateString()
              const dayEvents = eventsByDay.get(key) ?? []
              const isToday = key === todayKey
              return (
                <div key={key} className="flex min-h-24 flex-col gap-1 border-b border-r p-1.5 last:border-r-0">
                  <span className={cn('text-xs font-medium', isToday ? 'flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground' : 'text-muted-foreground')}>
                    {day.getDate()}
                  </span>
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {dayEvents.slice(0, 2).map((event) => (
                      <TooltipHint key={event.id} content={event.title}>
                      <button
                        className="truncate rounded bg-primary/15 px-1 py-0.5 text-left text-[11px] leading-tight text-primary hover:bg-primary/25"
                      >
                        {event.title}
                      </button>
                      </TooltipHint>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="px-1 text-[11px] text-muted-foreground">+{dayEvents.length - 2} more</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <Card key={`${event.calendarId}:${event.id}`} className="flex gap-3 p-4">
              <div className="mt-1 h-9 w-1 shrink-0 rounded-full bg-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">{event.title}</p>
                  <span className="text-xs text-muted-foreground">{formatEventTime(event)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{event.calendarName}{event.location ? ` - ${event.location}` : ''}</p>
                {event.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{event.description}</p>}
              </div>
            </Card>
          ))}
          {!loading && accountId && events.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No events in this range.</Card>}
        </div>
      )}
    </div>
  )
}
