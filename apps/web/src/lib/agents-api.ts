/**
 * API client for agent threads and providers.
 */

import type { GitStepResult } from './git-api'
import { getAuthToken } from './auth-token'
import { getApiUrl } from '@/lib/gateway-url'
import type { UserMessageSegment } from '@/lib/user-message-segments'
import type {
  AgentThread,
  AutomationPlan,
  AutomationRepo,
  CreateJaitTodoRequest,
  CreatePlanRequest,
  CreateReminderRequest,
  CreateRepoProposalRequest,
  CreateRepoRequest,
  CreateThreadRequest,
  CreateUserSecretRequest,
  GenerateJaitTodosRequest,
  GeneratePlanTasksRequest,
  JaitTodo,
  PlanTask,
  ProviderAuthStatus,
  ProviderId,
  ProviderInfo,
  ProviderLoginResult,
  ProviderLogoutResult,
  ProviderModelInfo,
  RemoteProviderInfo,
  ReminderRecord,
  ReminderSnapshot,
  RepoProposal,
  ThreadActivity,
  UpdateJaitTodoRequest,
  UpdatePlanRequest,
  UpdateReminderRequest,
  UpdateRepoProposalRequest,
  UpdateRepoRequest,
  UpdateThreadRequest,
  UserSecretRecord,
} from '@jait/shared'

const API_URL = getApiUrl()

// ── Types ────────────────────────────────────────────────────────────

export type {
  AgentThread,
  AutomationPlan,
  AutomationRepo,
  CreateJaitTodoRequest,
  CreatePlanRequest,
  CreateReminderRequest,
  CreateRepoProposalRequest,
  CreateRepoRequest,
  CreateThreadRequest,
  CreateUserSecretRequest,
  GenerateJaitTodosRequest,
  GeneratePlanTasksRequest,
  JaitTodo,
  PlanStatus,
  PlanTask,
  PlanTaskStatus,
  ProviderAuthStatus,
  ProviderId,
  ProviderInfo,
  ProviderLoginResult,
  ProviderLogoutResult,
  ProviderModelInfo,
  RemoteProviderInfo,
  ReminderRecord,
  ReminderSnapshot,
  RepoProposal,
  RuntimeMode,
  ThreadActivity,
  ThreadKind,
  ThreadStatus,
  UpdateJaitTodoRequest,
  UpdatePlanRequest,
  UpdateReminderRequest,
  UpdateRepoProposalRequest,
  UpdateRepoRequest,
  UpdateThreadRequest,
  UserSecretRecord,
} from '@jait/shared'

export interface ProviderAccount {
  id: string
  userId: string
  providerType: string
  nodeId: string
  label: string
  createdAt: string
  updatedAt: string
}

export interface ProviderAccountType {
  providerType: string
  name: string
  description: string
  version?: string
  distribution?: 'binary' | 'npx' | 'uvx'
  icon?: string
  website?: string
  repository?: string
}

type ProviderModelsResponse = {
  models: ProviderModelInfo[]
  recentModels?: string[]
  currentBackend?: string
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

  async listProviderAccounts(): Promise<{ accounts: ProviderAccount[]; providerTypes: ProviderAccountType[] }> {
    const res = await fetch(`${API_URL}/api/provider-accounts`, { headers: this.getHeaders() })
    if (!res.ok) throw new Error(`Failed to list provider accounts: ${res.statusText}`)
    return res.json() as Promise<{ accounts: ProviderAccount[]; providerTypes: ProviderAccountType[] }>
  }

  async createProviderAccount(providerType: string, label: string, nodeId = "gateway"): Promise<ProviderAccount> {
    const res = await fetch(`${API_URL}/api/provider-accounts`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ providerType, label, nodeId }),
    })
    const data = await res.json().catch(() => null) as { account?: ProviderAccount; error?: string } | null
    if (!res.ok || !data?.account) throw new Error(data?.error ?? `Failed to create provider account: ${res.statusText}`)
    this._providersInflight = null
    return data.account
  }

  async renameProviderAccount(accountId: string, label: string): Promise<ProviderAccount> {
    const res = await fetch(`${API_URL}/api/provider-accounts/${accountId}`, {
      method: 'PATCH',
      headers: this.getHeaders(true),
      body: JSON.stringify({ label }),
    })
    const data = await res.json().catch(() => null) as { account?: ProviderAccount; error?: string } | null
    if (!res.ok || !data?.account) throw new Error(data?.error ?? `Failed to rename provider account: ${res.statusText}`)
    this._providersInflight = null
    return data.account
  }

  async deleteProviderAccount(accountId: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/provider-accounts/${accountId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null) as { error?: string } | null
      throw new Error(data?.error ?? `Failed to delete provider account: ${res.statusText}`)
    }
    this._providersInflight = null
  }

  private _providersInflight: Promise<{ providers: ProviderInfo[]; remoteProviders: RemoteProviderInfo[] }> | null = null
  private _providersCachedAt = 0

  async listProviders(force = false): Promise<{ providers: ProviderInfo[]; remoteProviders: RemoteProviderInfo[] }> {
    // Deduplicate: reuse in-flight request or recent cache (30s TTL). The server
    // now serves this from a cache, so a longer client TTL is safe.
    const now = Date.now()
    if (!force && this._providersInflight && now - this._providersCachedAt < 30_000) {
      return this._providersInflight
    }
    this._providersCachedAt = now
    this._providersInflight = (async () => {
      const res = await fetch(`${API_URL}/api/providers${force ? '?fresh=1' : ''}`, {
        headers: this.getHeaders(),
      })
      if (!res.ok) throw new Error(`Failed to list providers: ${res.statusText}`)
      const data = await res.json() as { providers: ProviderInfo[]; remoteProviders?: RemoteProviderInfo[] }
      return { providers: data.providers, remoteProviders: data.remoteProviders ?? [] }
    })()
    this._providersInflight.catch(() => {
      // Clear cache on error so next call retries
      this._providersInflight = null
      this._providersCachedAt = 0
    })
    return this._providersInflight
  }

  /** Refresh connected nodes without forcing expensive gateway CLI auth probes. */
  async listProvidersLive(): Promise<{ providers: ProviderInfo[]; remoteProviders: RemoteProviderInfo[] }> {
    this._providersInflight = null
    this._providersCachedAt = 0
    return this.listProviders(false)
  }

  /** Force-refresh providers (bypasses the dedup cache and re-probes server-side). */
  async listProvidersFresh(): Promise<{ providers: ProviderInfo[]; remoteProviders: RemoteProviderInfo[] }> {
    this._providersInflight = null
    this._providersCachedAt = 0
    return this.listProviders(true)
  }

  async getProviderAuthStatus(providerId: ProviderId): Promise<ProviderAuthStatus> {
    const res = await fetch(`${API_URL}/api/providers/${providerId}/auth/status`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to get provider auth status: ${res.statusText}`)
    return res.json() as Promise<ProviderAuthStatus>
  }

  async startProviderLogin(providerId: ProviderId): Promise<ProviderLoginResult> {
    const res = await fetch(`${API_URL}/api/providers/${providerId}/auth/login`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({}),
    })
    const data = await res.json().catch(() => null) as ProviderLoginResult | { error?: string } | null
    if (!res.ok) {
      const message = data && 'message' in data && typeof data.message === 'string'
        ? data.message
        : data && 'error' in data && typeof data.error === 'string'
          ? data.error
          : `Failed to start provider login: ${res.statusText}`
      throw new Error(message)
    }
    return data as ProviderLoginResult
  }

  async logoutProvider(providerId: ProviderId): Promise<ProviderLogoutResult> {
    const res = await fetch(`${API_URL}/api/providers/${providerId}/auth/logout`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({}),
    })
    const data = await res.json().catch(() => null) as ProviderLogoutResult | { error?: string } | null
    if (!res.ok) {
      const message = data && 'message' in data && typeof data.message === 'string'
        ? data.message
        : data && 'error' in data && typeof data.error === 'string'
          ? data.error
          : `Failed to log out provider: ${res.statusText}`
      throw new Error(message)
    }
    return data as ProviderLogoutResult
  }

  async sendProviderLoginInput(providerId: ProviderId, code: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/providers/${providerId}/auth/login/input`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ code }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null) as { error?: string } | null
      throw new Error(data?.error ?? `Failed to send login code: ${res.statusText}`)
    }
  }

  private _modelsInflight = new Map<string, Promise<ProviderModelsResponse>>()
  private _modelsCachedAt = new Map<string, number>()

  /** Drop the in-memory model cache so the next fetch pulls a fresh catalogue. */
  resetProviderModels(): void {
    this._modelsInflight.clear()
    this._modelsCachedAt.clear()
  }

  async refreshProviderModels(providerId: ProviderId, nodeId?: string | null): Promise<ProviderModelsResponse> {
    const response = await fetch(`${API_URL}/api/providers/models/reset`, {
      method: 'POST',
      headers: this.getHeaders(),
    })
    if (!response.ok) throw new Error(`Failed to refresh models: ${response.statusText}`)
    this.resetProviderModels()
    return this.listProviderModels(providerId, nodeId)
  }

  async listProviderModels(providerId: ProviderId, nodeId?: string | null): Promise<ProviderModelsResponse> {
    const effectiveNodeId = providerId === 'jait' ? 'gateway' : nodeId?.trim() || 'gateway'
    const cacheKey = `${providerId}:${effectiveNodeId}`
    const now = Date.now()
    const cachedAt = this._modelsCachedAt.get(cacheKey) ?? 0
    const existing = this._modelsInflight.get(cacheKey)
    if (existing && now - cachedAt < 15_000) return existing

    this._modelsCachedAt.set(cacheKey, now)
    const promise = (async () => {
      const nodeQuery = effectiveNodeId === 'gateway' ? '' : `?nodeId=${encodeURIComponent(effectiveNodeId)}`
      const res = await fetch(`${API_URL}/api/providers/${providerId}/models${nodeQuery}`, {
        headers: this.getHeaders(),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string; message?: string }
        throw new Error(err.error || err.message || `Failed to list models: ${res.statusText}`)
      }
      return res.json() as Promise<ProviderModelsResponse>
    })()
    this._modelsInflight.set(cacheKey, promise)
    promise.catch(() => {
      this._modelsInflight.delete(cacheKey)
      this._modelsCachedAt.delete(cacheKey)
    })
    return promise
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

  async steerThread(id: string, message: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/threads/${id}/steer`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ message }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, unknown>
      const details = typeof err.details === 'string' ? err.details : null
      const error = typeof err.error === 'string' ? err.error : null
      throw new Error(details || error || `Failed to steer thread: ${res.statusText}`)
    }
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

  async listJaitTodos(repoId: string): Promise<JaitTodo[]> {
    const res = await fetch(`${API_URL}/api/repos/${repoId}/todos`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to list todos: ${res.statusText}`)
    const data = await res.json() as { todos: JaitTodo[] }
    return data.todos
  }

  async createJaitTodo(repoId: string, params: CreateJaitTodoRequest): Promise<JaitTodo> {
    const res = await fetch(`${API_URL}/api/repos/${repoId}/todos`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(params),
    })
    if (!res.ok) throw new Error(`Failed to create todo: ${res.statusText}`)
    const data = await res.json() as { todo: JaitTodo }
    return data.todo
  }

  async generateJaitTodos(repoId: string, params: GenerateJaitTodosRequest = {}): Promise<{ todos: JaitTodo[]; generated: number }> {
    const res = await fetch(`${API_URL}/api/repos/${repoId}/todos/generate`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(err.error || `Failed to generate todos: ${res.statusText}`)
    }
    return await res.json() as { todos: JaitTodo[]; generated: number }
  }

  async updateJaitTodo(todoId: string, params: UpdateJaitTodoRequest): Promise<JaitTodo> {
    const res = await fetch(`${API_URL}/api/jait-todos/${todoId}`, {
      method: 'PATCH',
      headers: this.getHeaders(true),
      body: JSON.stringify(params),
    })
    if (!res.ok) throw new Error(`Failed to update todo: ${res.statusText}`)
    const data = await res.json() as { todo: JaitTodo }
    return data.todo
  }

  async deleteJaitTodo(todoId: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/jait-todos/${todoId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to delete todo: ${res.statusText}`)
  }

  async getRemindersSnapshot(params: { status?: 'active' | 'archived' | 'all'; limit?: number } = {}): Promise<ReminderSnapshot> {
    const search = new URLSearchParams()
    if (params.status) search.set('status', params.status)
    if (typeof params.limit === 'number') search.set('limit', String(params.limit))
    const query = search.toString()
    const res = await fetch(`${API_URL}/api/reminders${query ? `?${query}` : ''}`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to load reminders: ${res.statusText}`)
    return res.json() as Promise<ReminderSnapshot>
  }

  async exportMemoryMarkdown(params: { status?: 'active' | 'archived' | 'all'; projectId?: string; limit?: number } = {}): Promise<string> {
    const search = new URLSearchParams()
    if (params.status) search.set('status', params.status)
    if (params.projectId && params.projectId !== 'all') search.set('projectId', params.projectId)
    if (typeof params.limit === 'number') search.set('limit', String(params.limit))
    const query = search.toString()
    const res = await fetch(`${API_URL}/api/reminders/export.md${query ? `?${query}` : ''}`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to export memory: ${res.statusText}`)
    return res.text()
  }

  async createReminder(params: CreateReminderRequest): Promise<ReminderRecord> {
    const res = await fetch(`${API_URL}/api/reminders`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(params),
    })
    if (!res.ok) throw new Error(`Failed to create reminder: ${res.statusText}`)
    const data = await res.json() as { reminder: ReminderRecord }
    return data.reminder
  }

  async updateReminder(id: string, params: UpdateReminderRequest): Promise<ReminderRecord> {
    const res = await fetch(`${API_URL}/api/reminders/${id}`, {
      method: 'PATCH',
      headers: this.getHeaders(true),
      body: JSON.stringify(params),
    })
    if (!res.ok) throw new Error(`Failed to update reminder: ${res.statusText}`)
    const data = await res.json() as { reminder: ReminderRecord }
    return data.reminder
  }

  async deleteReminder(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/reminders/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to delete reminder: ${res.statusText}`)
  }

  async listUserSecrets(params: { type?: string } = {}): Promise<UserSecretRecord[]> {
    const search = new URLSearchParams()
    if (params.type) search.set('type', params.type)
    const query = search.toString()
    const res = await fetch(`${API_URL}/api/secrets${query ? `?${query}` : ''}`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to load secrets: ${res.statusText}`)
    const data = await res.json() as { secrets: UserSecretRecord[] }
    return data.secrets
  }

  async createUserSecret(params: CreateUserSecretRequest): Promise<UserSecretRecord> {
    const res = await fetch(`${API_URL}/api/secrets`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(params),
    })
    if (!res.ok) throw new Error(`Failed to save secret: ${res.statusText}`)
    const data = await res.json() as { secret: UserSecretRecord }
    return data.secret
  }

  async deleteUserSecret(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/secrets/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to delete secret: ${res.statusText}`)
  }

  async listRepoProposals(repoId: string): Promise<RepoProposal[]> {
    return this.listJaitTodos(repoId)
  }

  async createRepoProposal(repoId: string, params: CreateRepoProposalRequest): Promise<RepoProposal> {
    return this.createJaitTodo(repoId, params)
  }

  async updateRepoProposal(proposalId: string, params: UpdateRepoProposalRequest): Promise<RepoProposal> {
    return this.updateJaitTodo(proposalId, params)
  }

  async deleteRepoProposal(proposalId: string): Promise<void> {
    return this.deleteJaitTodo(proposalId)
  }
}

export const agentsApi = new AgentsApi()
