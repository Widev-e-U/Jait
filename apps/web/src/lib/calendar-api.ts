import { apiFetch } from './api-fetch'
import { getApiUrl } from '@/lib/gateway-url'

const API_URL = getApiUrl()

export interface CalendarAccount {
  id: string
  userId: string | null
  provider: 'google' | 'android'
  email: string
  displayName: string
  status: 'connected' | 'error'
  error?: string | null
  createdAt: string
  updatedAt: string
}

export interface CalendarInfo {
  id: string
  name: string
  description: string
  timeZone: string
  primary: boolean
  selected: boolean
  accessRole: string
  color?: string
}

export interface CalendarEvent {
  id: string
  calendarId: string
  calendarName: string
  title: string
  description: string
  location: string
  start: string
  end: string
  allDay: boolean
  status: string
  organizer: string
  attendees: string[]
  htmlLink?: string
}

async function asJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((data as { error?: string }).error || `Request failed (${response.status})`)
  return data as T
}

export const calendarApi = {
  async config(): Promise<{ google: boolean; redirectUri: string }> {
    const response = await apiFetch(`${API_URL}/api/calendar/config`)
    const data = await asJson<{ providers: { google: boolean }; redirectUri: string }>(response)
    return { ...data.providers, redirectUri: data.redirectUri }
  },

  async saveAppCredentials(clientId: string, clientSecret: string): Promise<void> {
    const response = await apiFetch(`${API_URL}/api/calendar/config/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret }),
    })
    await asJson(response)
  },

  async accounts(): Promise<CalendarAccount[]> {
    const response = await apiFetch(`${API_URL}/api/calendar/accounts`)
    const data = await asJson<{ accounts: CalendarAccount[] }>(response)
    return data.accounts
  },

  async connectUrl(): Promise<{ authUrl: string; redirectUri: string }> {
    const response = await apiFetch(`${API_URL}/api/calendar/connect/google`)
    const data = await asJson<{ authUrl: string; redirectUri: string }>(response)
    return data
  },

  async disconnect(accountId: string): Promise<void> {
    const response = await apiFetch(`${API_URL}/api/calendar/accounts/${accountId}`, { method: 'DELETE' })
    await asJson(response)
  },

  async syncDevice(snapshot: {
    deviceId: string
    deviceName: string
    calendars: CalendarInfo[]
    events: CalendarEvent[]
  }): Promise<CalendarAccount> {
    const response = await apiFetch(`${API_URL}/api/calendar/device/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    })
    const data = await asJson<{ account: CalendarAccount }>(response)
    return data.account
  },

  async calendars(accountId?: string): Promise<CalendarInfo[]> {
    const params = new URLSearchParams()
    if (accountId) params.set('accountId', accountId)
    const response = await apiFetch(`${API_URL}/api/calendar/calendars?${params.toString()}`)
    const data = await asJson<{ calendars: CalendarInfo[] }>(response)
    return data.calendars
  },

  async events(options: {
    accountId?: string
    calendarId?: string
    timeMin?: string
    timeMax?: string
    q?: string
    limit?: number
  } = {}): Promise<CalendarEvent[]> {
    const params = new URLSearchParams()
    if (options.accountId) params.set('accountId', options.accountId)
    if (options.calendarId) params.set('calendarId', options.calendarId)
    if (options.timeMin) params.set('timeMin', options.timeMin)
    if (options.timeMax) params.set('timeMax', options.timeMax)
    if (options.q) params.set('q', options.q)
    if (options.limit) params.set('limit', String(options.limit))
    const response = await apiFetch(`${API_URL}/api/calendar/events?${params.toString()}`)
    const data = await asJson<{ events: CalendarEvent[] }>(response)
    return data.events
  },
}
