import type { PersonaAgentProfile, TeamDelivery, TeamRoom, TeamRoomMessage, TeamMessageKind } from '@jait/shared'
import { getApiUrl } from './gateway-url'
import { getAuthToken } from './auth-token'

export interface TeamRoomSnapshot {
  room: TeamRoom
  members: PersonaAgentProfile[]
  messages: TeamRoomMessage[]
  deliveries: TeamDelivery[]
  /** Present in paged responses: older messages exist before the first returned one. */
  hasMore?: boolean
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken()
  const response = await fetch(getApiUrl() + path, { ...init, headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...init?.headers,
  } })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Could not load team conversation')
  }
  return response.json() as Promise<T>
}
export const teamChatApi = {
  list: () => request<{ rooms: TeamRoom[] }>('/api/team-rooms'),
  create: (input: { name: string; memberIds: string[] }) => request<{ room: TeamRoom }>('/api/team-rooms', { method: 'POST', body: JSON.stringify(input) }),
  get: (roomId: string, page?: { limit: number; before?: string }) => request<TeamRoomSnapshot>('/api/team-rooms/' + encodeURIComponent(roomId) +
    (page ? '?limit=' + page.limit + (page.before ? '&before=' + encodeURIComponent(page.before) : '') : '')),
  post: (roomId: string, input: { content: string; attachments?: TeamRoomMessage["attachments"]; clientKey: string; targetSessionId?: string; recipientIds?: string[]; kind?: TeamMessageKind }) =>
    request<{ message: TeamRoomMessage }>('/api/team-rooms/' + encodeURIComponent(roomId) + '/messages', { method: 'POST', body: JSON.stringify(input) }),
}
