import type { PersonaAgentProfile, TeamDelivery, TeamRoom, TeamRoomMessage, TeamMessageKind } from '@jait/shared'
import { getApiUrl } from './gateway-url'
import { getAuthToken } from './auth-token'

export interface TeamRoomSnapshot {
  room: TeamRoom
  members: PersonaAgentProfile[]
  messages: TeamRoomMessage[]
  deliveries: TeamDelivery[]
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
  get: (roomId: string) => request<TeamRoomSnapshot>('/api/team-rooms/' + encodeURIComponent(roomId)),
  post: (roomId: string, input: { content: string; attachments?: TeamRoomMessage["attachments"]; clientKey: string; targetSessionId?: string; recipientIds?: string[]; kind?: TeamMessageKind }) =>
    request<{ message: TeamRoomMessage }>('/api/team-rooms/' + encodeURIComponent(roomId) + '/messages', { method: 'POST', body: JSON.stringify(input) }),
}
