/**
 * API client for agent threads and providers.
 */

import type { GitStepResult } from './git-api'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Types ────────────────────────────────────────────────────────────

export type ProviderId = 'jait' | 'codex' | 'claude-code'
export type ThreadStatus = 'idle' | 'running' | 'completed' | 'error' | 'interrupted'
export type RuntimeMode = 'full-access' | 'supervised'

export interface AgentThread {
  id: string
  userId: string | null
  sessionId: string | null
  title: string
  providerId: ProviderId
  model: string | null
  runtimeMode: RuntimeMode
  workingDirectory: string | null
  branch: string | null
  status: ThreadStatus
  providerSessionId: string | null
  error: string | null
  prUrl: string | null
  prNumber: number | null
  prTitle: string | null
  prState: 'open' | 'closed' | 'merged' | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface ThreadActivity {
  id: string
  threadId: string
  kind: string
  summary: string
  payload?: unknown
  createdAt: string
}

export interface ProviderInfo {
  id: ProviderId
  name: string
  description: string
  available: boolean
  unavailableReason?: string
  modes: RuntimeMode[]
}

export interface CreateThreadRequest {
  sessionId?: string
  title: string
  providerId: ProviderId
  model?: string
  runtimeMode?: RuntimeMode
  workingDirectory?: string
  branch?: string
}

export interface UpdateThreadRequest {
  title?: string
  model?: string
  runtimeMode?: RuntimeMode
  workingDirectory?: string
  branch?: string
  prUrl?: string | null
  prNumber?: number | null
  prTitle?: string | null
  prState?: 'open' | 'closed' | 'merged' | null
}

export interface GenerateThreadTitleRequest {
  task: string
  prefix?: string
}

export interface CreateThreadPrRequest {
  commitMessage?: string
  baseBranch?: string
  githubToken?: string | null
}

export interface CreateThreadPrResponse {
  message: string
  prUrl: string | null
  result: GitStepResult
  thread?: AgentThread
}

export interface AutomationRepo {
  id: string
  userId: string | null
  name: string
  defaultBranch: string
  localPath: string
  githubToken: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateRepoRequest {
  name: string
  defaultBranch?: string
  localPath: string
  githubToken?: string | null
}

export interface UpdateRepoRequest {
  name?: string
  defaultBranch?: string
  localPath?: string
  githubToken?: string | null
}

// ── API Client ───────────────────────────────────────────────────────

export class AgentsApi {
  private getToken(): string | null {
    return localStorage.getItem('token')
  }

  private getHeaders(withJsonBody = false): HeadersInit {
    const headers: HeadersInit = {}
    if (withJsonBody) {
      headers['Content-Type'] = 'application/json'
    }
    const token = this.getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  // ── Providers ──────────────────────────────────────────────────

  async listProviders(): Promise<ProviderInfo[]> {
    const res = await fetch(`${API_URL}/api/providers`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to list providers: ${res.statusText}`)
    const data = await res.json() as { providers: ProviderInfo[] }
    return data.providers
  }

  async listProviderModels(providerId: ProviderId): Promise<{ id: string; name: string; description?: string; isDefault?: boolean }[]> {
    const res = await fetch(`${API_URL}/api/providers/${providerId}/models`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to list models: ${res.statusText}`)
    const data = await res.json() as { models: { id: string; name: string; description?: string; isDefault?: boolean }[] }
    return data.models
  }

  // ── Threads CRUD ───────────────────────────────────────────────

  async listThreads(sessionId?: string): Promise<AgentThread[]> {
    const params = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''
    const res = await fetch(`${API_URL}/api/threads${params}`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to list threads: ${res.statusText}`)
    const data = await res.json() as { threads: AgentThread[] }
    return data.threads
  }

  async getThread(id: string): Promise<AgentThread> {
    const res = await fetch(`${API_URL}/api/threads/${id}`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to get thread: ${res.statusText}`)
    return res.json() as Promise<AgentThread>
  }

  async createThread(params: CreateThreadRequest): Promise<AgentThread> {
    const res = await fetch(`${API_URL}/api/threads`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(params),
    })
    if (!res.ok) throw new Error(`Failed to create thread: ${res.statusText}`)
    return res.json() as Promise<AgentThread>
  }

  async updateThread(id: string, params: UpdateThreadRequest): Promise<AgentThread> {
    const res = await fetch(`${API_URL}/api/threads/${id}`, {
      method: 'PATCH',
      headers: this.getHeaders(true),
      body: JSON.stringify(params),
    })
    if (!res.ok) throw new Error(`Failed to update thread: ${res.statusText}`)
    return res.json() as Promise<AgentThread>
  }

  async generateThreadTitle(id: string, params: GenerateThreadTitleRequest): Promise<AgentThread> {
    const res = await fetch(`${API_URL}/api/threads/${id}/generate-title`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(params),
    })
    if (!res.ok) throw new Error(`Failed to generate thread title: ${res.statusText}`)
    return res.json() as Promise<AgentThread>
  }

  async deleteThread(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/threads/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to delete thread: ${res.statusText}`)
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  async startThread(id: string, message?: string): Promise<AgentThread> {
    const res = await fetch(`${API_URL}/api/threads/${id}/start`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ message }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, unknown>
      throw new Error((err.error as string) || `Failed to start thread: ${res.statusText}`)
    }
    return res.json() as Promise<AgentThread>
  }

  async sendTurn(id: string, message: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/threads/${id}/send`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ message }),
    })
    if (!res.ok) throw new Error(`Failed to send turn: ${res.statusText}`)
  }

  async stopThread(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/threads/${id}/stop`, {
      method: 'POST',
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to stop thread: ${res.statusText}`)
  }

  async interruptThread(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/threads/${id}/interrupt`, {
      method: 'POST',
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to interrupt thread: ${res.statusText}`)
  }

  async approveToolCall(id: string, requestId: string, approved: boolean): Promise<void> {
    const res = await fetch(`${API_URL}/api/threads/${id}/approve`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ requestId, approved }),
    })
    if (!res.ok) throw new Error(`Failed to approve: ${res.statusText}`)
  }

  async createPullRequest(id: string, params: CreateThreadPrRequest): Promise<CreateThreadPrResponse> {
    const res = await fetch(`${API_URL}/api/threads/${id}/create-pr`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, unknown>
      throw new Error((err.error as string) || `Failed to create pull request: ${res.statusText}`)
    }
    return res.json() as Promise<CreateThreadPrResponse>
  }

  // ── Activities ─────────────────────────────────────────────────

  async getActivities(threadId: string, limit?: number): Promise<ThreadActivity[]> {
    const params = typeof limit === 'number' ? `?limit=${limit}` : ''
    const res = await fetch(`${API_URL}/api/threads/${threadId}/activities${params}`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to get activities: ${res.statusText}`)
    const data = await res.json() as { activities: ThreadActivity[] }
    return data.activities
  }

  // ── Repositories ──────────────────────────────────────────────

  async listRepos(): Promise<AutomationRepo[]> {
    const res = await fetch(`${API_URL}/api/repos`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to list repos: ${res.statusText}`)
    const data = await res.json() as { repos: AutomationRepo[] }
    return data.repos
  }

  async createRepo(params: CreateRepoRequest): Promise<AutomationRepo> {
    const res = await fetch(`${API_URL}/api/repos`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(params),
    })
    if (!res.ok) throw new Error(`Failed to create repo: ${res.statusText}`)
    const data = await res.json() as { repo: AutomationRepo }
    return data.repo
  }

  async updateRepo(id: string, params: UpdateRepoRequest): Promise<AutomationRepo> {
    const res = await fetch(`${API_URL}/api/repos/${id}`, {
      method: 'PATCH',
      headers: this.getHeaders(true),
      body: JSON.stringify(params),
    })
    if (!res.ok) throw new Error(`Failed to update repo: ${res.statusText}`)
    const data = await res.json() as { repo: AutomationRepo }
    return data.repo
  }

  async deleteRepo(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/repos/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to delete repo: ${res.statusText}`)
  }
}

export const agentsApi = new AgentsApi()
