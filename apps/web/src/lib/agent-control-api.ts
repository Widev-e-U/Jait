import { apiFetch } from './api-fetch'
import { getApiUrl } from './gateway-url'

import type { AgentControlState, AgentHaltResult } from '@jait/shared'
export type { AgentControlState, AgentHaltResult } from '@jait/shared'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(getApiUrl() + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || 'Could not reach the agent controls')
  }
  return response.json() as Promise<T>
}

export const agentControlApi = {
  get: () => request<{ state: AgentControlState }>('/api/agent-control'),
  halt: (reason?: string) =>
    request<AgentHaltResult>('/api/agent-control/halt', {
      method: 'POST',
      body: JSON.stringify(reason ? { reason } : {}),
    }),
  resume: () => request<{ state: AgentControlState }>('/api/agent-control/resume', { method: 'POST' }),
}
