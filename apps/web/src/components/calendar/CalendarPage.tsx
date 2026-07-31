import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Loader2, RefreshCw, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { calendarApi, type CalendarAccount, type CalendarEvent } from '@/lib/calendar-api'

interface DeviceCalendarSnapshot {
  deviceId: string
  deviceName: string
  calendars: Parameters<typeof calendarApi.syncDevice>[0]['calendars']
  events: CalendarEvent[]
}

function formatEventTime(event: CalendarEvent): string {
  const start = new Date(event.start)
  if (event.allDay) return start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  return start.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function CalendarPage() {
  const [accounts, setAccounts] = useState<CalendarAccount[]>([])
  const [accountId, setAccountId] = useState('')
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const isAndroid = Boolean((window.Capacitor as { Plugins?: { DeviceCalendar?: unknown } } | undefined)?.Plugins?.DeviceCalendar)

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
    const now = new Date()
    const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    setEvents(await calendarApi.events({ accountId: selectedAccountId, timeMin: now.toISOString(), timeMax: timeMax.toISOString(), limit: 250 }))
  }, [])

  useEffect(() => {
    void loadAccounts().catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to load calendars')).finally(() => setLoading(false))
  }, [loadAccounts])

  useEffect(() => {
    if (!accountId) return
    setLoading(true)
    void loadEvents(accountId).catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to load events')).finally(() => setLoading(false))
  }, [accountId, loadEvents])

  const syncAndroid = useCallback(async () => {
    const plugin = (window.Capacitor as {
      Plugins?: { DeviceCalendar?: { readSnapshot: (options: { timeMin: number; timeMax: number }) => Promise<DeviceCalendarSnapshot> } }
    } | undefined)?.Plugins?.DeviceCalendar
    if (!plugin) return
    setSyncing(true)
    try {
      const now = Date.now()
      const snapshot = await plugin.readSnapshot({ timeMin: now - 30 * 86400000, timeMax: now + 90 * 86400000 })
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
  }, [loadAccounts, loadEvents])

  const selectedAccount = useMemo(() => accounts.find((account) => account.id === accountId), [accountId, accounts])

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
        <Button variant="ghost" size="icon" disabled={!accountId || loading} onClick={() => void loadEvents(accountId)} aria-label="Refresh events">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </Card>

      {accounts.length === 0 && !loading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {isAndroid ? 'Tap Sync Samsung calendar and allow calendar access, or connect Google Calendar in Settings.' : 'Connect Google Calendar in Settings, or sync Samsung Calendar from the Android app.'}
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
          {!loading && accountId && events.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No events in the next 30 days.</Card>}
        </div>
      )}
    </div>
  )
}
