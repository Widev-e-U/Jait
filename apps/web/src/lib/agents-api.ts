/**
 * API client for agent threads and providers.
 */

import type { GitStepResult } from './git-api'
import { getAuthToken } from './auth-token'
import { getApiUrl } from '@/lib/gateway-url'
import type { UserMessageSegment } from '@/lib/user-message-segments'

const API_URL = getApiUrl()

// ── Types ────────────────────────────────────────────────────────────

export type ProviderId = 'jait' | 'codex' | 'claude-code' | 'gemini' | 'opencode' | 'copilot'
export type ThreadStatus = 'running' | 'completed' | 'error' | 'interrupted'
export type RuntimeMode = 'full-access' | 'supervised'
export type ThreadKind = 'delivery' | 'delegation'

export interface AgentThread {
  id: string
  userId: string | null
  sessionId: string | null
  title: string
  providerId: ProviderId
  model: string | null
  runtimeMode: RuntimeMode
  kind: ThreadKind
  workingDirectory: string | null
  branch: string | null
  status: ThreadStatus
  providerSessionId: string | null
  error: string | null
  prUrl: string | null
  prNumber: number | null
  prTitle: string | null
  prState: 'creating' | 'open' | 'closed' | 'merged' | null
  executionNodeId: string | null
  executionNodeName: string | null
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

export interface RemoteProviderInfo {
  nodeId: string
  nodeName: string
  platform: string
  providers: string[]
}

export interface CreateThreadRequest {
  sessionId?: string
  title: string
  providerId: ProviderId
  model?: string
  runtimeMode?: RuntimeMode
  kind?: ThreadKind
  workingDirectory?: string
  branch?: string
}

export interface UpdateThreadRequest {
  title?: string
  model?: string
  runtimeMode?: RuntimeMode
  kind?: ThreadKind
  workingDirectory?: string
  branch?: string
  prUrl?: string | null
  prNumber?: number | null
  prTitle?: string | null
  prState?: 'creating' | 'open' | 'closed' | 'merged' | null
}

export interface ThreadReferencedFile {
  path: string
  name: string
}

export interface ThreadMessageMetadata {
  attachments?: string[]
  displayContent?: string
  referencedFiles?: ThreadReferencedFile[]
  displaySegments?: UserMessageSegment[]
}

export interface StartThreadOptions {
  message?: string
  titlePrefix?: string
  titleTask?: string
  cloneToGateway?: boolean
  repoUrl?: string
  attachments?: string[]
  displayContent?: string
  referencedFiles?: ThreadReferencedFile[]
  displaySegments?: UserMessageSegment[]
}

export interface CreateThreadPrRequest {
  commitMessage?: string
  baseBranch?: string
}

export interface CreateThreadPrResponse {
  message?: string
  error?: string
  prUrl?: string | null
  result: GitStepResult
  thread?: AgentThread
  pushFailed?: boolean
  resumed?: boolean
}

export interface AutomationRepo {
  id: string
  userId: string | null
  deviceId: string | null
  name: string
  defaultBranch: string
  localPath: string
  githubUrl: string | null
  /** @deprecated Use forgeUrl */
  forgeUrl: string | null
  strategy: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateRepoRequest {
  name: string
  defaultBranch?: string
  localPath: string
  deviceId?: string
  /** Remote URL for any git forge (GitHub, GitLab, Gitea, Azure DevOps, Bitbucket) */
  forgeUrl?: string
  /** @deprecated Use forgeUrl */
  githubUrl?: string
}

export interface UpdateRepoRequest {
  name?: string
  defaultBranch?: string
  localPath?: string
  deviceId?: string
  forgeUrl?: string
  /** @deprecated Use forgeUrl */
  githubUrl?: string
  strategy?: string | null
}

// ── Plan Types ──────────────────────────────────────────────────────

export type PlanStatus = 'draft' | 'active' | 'completed' | 'archived'
export type PlanTaskStatus = 'proposed' | 'approved' | 'running' | 'completed' | 'skipped'

export interface PlanTask {
  id: string
  title: string
  description: string
  status: PlanTaskStatus
  threadId?: string
  dependsOn?: string[]
}

export interface AutomationPlan {
  id: string
  repoId: string
  userId: string | null
  title: string
  status: PlanStatus
  tasks: PlanTask[]
  createdAt: string
  updatedAt: string
}

export interface CreatePlanRequest {
  title?: string
  tasks?: PlanTask[]
}

export interface UpdatePlanRequest {
  title?: string
  status?: PlanStatus
  tasks?: PlanTask[]
}

export interface GeneratePlanTasksRequest {
  prompt?: string
  provider?: ProviderId
  model?: string | null
}

// ── API Client ───────────────────────────────────────────────────────

export class AgentsApi {
  private getToken(): string | null {
    return getAuthToken()
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

  async listProviders(): Promise<{ providers: ProviderInfo[]; remoteProviders: RemoteProviderInfo[] }> {
    const res = await fetch(`${API_URL}/api/providers`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to list providers: ${res.statusText}`)
    const data = await res.json() as { providers: ProviderInfo[]; remoteProviders?: RemoteProviderInfo[] }
    return { providers: data.providers, remoteProviders: data.remoteProviders ?? [] }
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
    const data = await this.listThreadsPage({ sessionId })
    return data.threads
  }

  async listThreadsPage(options: { sessionId?: string; limit?: number } = {}): Promise<{ threads: AgentThread[]; hasMore: boolean }> {
    const params = new URLSearchParams()
    if (options.sessionId) params.set('sessionId', options.sessionId)
    if (typeof options.limit === 'number') params.set('limit', String(options.limit))
    const query = params.toString()
    const res = await fetch(`${API_URL}/api/threads${query ? `?${query}` : ''}`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to list threads: ${res.statusText}`)
    const data = await res.json() as { threads: AgentThread[]; hasMore?: boolean }
    return { threads: data.threads, hasMore: Boolean(data.hasMore) }
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

  async deleteThread(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/threads/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to delete thread: ${res.statusText}`)
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  async startThread(id: string, options?: string | StartThreadOptions): Promise<AgentThread> {
    // Accept plain string (message) for backwards compat, or options object
    const body = typeof options === 'string'
      ? { message: options }
      : options ?? {}
    const res = await fetch(`${API_URL}/api/threads/${id}/start`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, unknown>
      const error = new Error((err.error as string) || `Failed to start thread: ${res.statusText}`) as Error & { code?: string }
      if (err.code) error.code = err.code as string
      throw error
    }
    return res.json() as Promise<AgentThread>
  }

  async sendTurn(id: string, options: string | ({ message: string } & ThreadMessageMetadata)): Promise<void> {
    const body = typeof options === 'string'
      ? { message: options }
      : options
    const res = await fetch(`${API_URL}/api/threads/${id}/send`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(body),
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

  // ── Repository Strategy ───────────────────────────────────────

  async getRepoStrategy(repoId: string): Promise<string> {
    const res = await fetch(`${API_URL}/api/repos/${repoId}/strategy`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to get strategy: ${res.statusText}`)
    const data = await res.json() as { strategy: string }
    return data.strategy
  }

  async updateRepoStrategy(repoId: string, strategy: string): Promise<string> {
    const res = await fetch(`${API_URL}/api/repos/${repoId}/strategy`, {
      method: 'PUT',
      headers: this.getHeaders(true),
      body: JSON.stringify({ strategy }),
    })
    if (!res.ok) throw new Error(`Failed to update strategy: ${res.statusText}`)
    const data = await res.json() as { strategy: string }
    return data.strategy
  }

  async generateRepoStrategy(repoId: string): Promise<string> {
    const res = await fetch(`${API_URL}/api/repos/${repoId}/strategy/generate`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({}),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string }
      throw new Error(err.error || `Failed to generate strategy: ${res.statusText}`)
    }
    const data = await res.json() as { strategy: string }
    return data.strategy
  }

  // ── Plans ──────────────────────────────────────────────────────

  async listPlans(repoId: string): Promise<AutomationPlan[]> {
    const res = await fetch(`${API_URL}/api/repos/${repoId}/plans`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to list plans: ${res.statusText}`)
    const data = await res.json() as { plans: AutomationPlan[] }
    return data.plans
  }

  async createPlan(repoId: string, params?: CreatePlanRequest): Promise<AutomationPlan> {
    const res = await fetch(`${API_URL}/api/repos/${repoId}/plans`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(params ?? {}),
    })
    if (!res.ok) throw new Error(`Failed to create plan: ${res.statusText}`)
    const data = await res.json() as { plan: AutomationPlan }
    return data.plan
  }

  async getPlan(planId: string): Promise<AutomationPlan> {
    const res = await fetch(`${API_URL}/api/plans/${planId}`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to get plan: ${res.statusText}`)
    const data = await res.json() as { plan: AutomationPlan }
    return data.plan
  }

  async updatePlan(planId: string, params: UpdatePlanRequest): Promise<AutomationPlan> {
    const res = await fetch(`${API_URL}/api/plans/${planId}`, {
      method: 'PATCH',
      headers: this.getHeaders(true),
      body: JSON.stringify(params),
    })
    if (!res.ok) throw new Error(`Failed to update plan: ${res.statusText}`)
    const data = await res.json() as { plan: AutomationPlan }
    return data.plan
  }

  async deletePlan(planId: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/plans/${planId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to delete plan: ${res.statusText}`)
  }

  async generatePlanTasks(planId: string, params?: GeneratePlanTasksRequest): Promise<{ plan: AutomationPlan; generated: number }> {
    const res = await fetch(`${API_URL}/api/plans/${planId}/generate`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(params ?? {}),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string }
      throw new Error(err.error || `Failed to generate tasks: ${res.statusText}`)
    }
    return await res.json() as { plan: AutomationPlan; generated: number }
  }

  async startPlanTask(planId: string, taskId: string): Promise<{ task: PlanTask; repo: { id: string; name: string; localPath: string; defaultBranch: string; githubUrl: string | null } }> {
    const res = await fetch(`${API_URL}/api/plans/${planId}/tasks/${taskId}/start`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({}),
    })
    if (!res.ok) throw new Error(`Failed to start task: ${res.statusText}`)
    return await res.json() as { task: PlanTask; repo: { id: string; name: string; localPath: string; defaultBranch: string; githubUrl: string | null } }
  }

  async startAllPlanTasks(planId: string): Promise<{ tasks: PlanTask[]; repo: { id: string; name: string; localPath: string; defaultBranch: string; githubUrl: string | null } }> {
    const res = await fetch(`${API_URL}/api/plans/${planId}/start`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({}),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string }
      throw new Error(err.error || `Failed to start tasks: ${res.statusText}`)
    }
    return await res.json() as { tasks: PlanTask[]; repo: { id: string; name: string; localPath: string; defaultBranch: string; githubUrl: string | null } }
  }
}

export const agentsApi = new AgentsApi()
