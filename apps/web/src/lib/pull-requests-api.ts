import type {
  PullRequestConflictSide,
  PullRequestDetail,
  PullRequestDiff,
  PullRequestListState,
  PullRequestMergeMethod,
  PullRequestResolveResult,
  PullRequestReviewEvent,
  PullRequestSummary,
} from '@jait/shared'
import { getAuthToken } from './auth-token'
import { getApiUrl } from './gateway-url'

const API_URL = getApiUrl()

function headers(json = false): HeadersInit {
  const result: HeadersInit = {}
  if (json) result['Content-Type'] = 'application/json'
  const token = getAuthToken()
  if (token) result.Authorization = `Bearer ${token}`
  return result
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init)
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(error.error || `Pull request request failed: ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

function repoPath(repoId: string, suffix = ''): string {
  return `/api/repos/${encodeURIComponent(repoId)}/pull-requests${suffix}`
}

export const pullRequestsApi = {
  async list(
    repoId: string,
    state: PullRequestListState = 'open',
  ): Promise<PullRequestSummary[]> {
    const response = await request<{ pullRequests: PullRequestSummary[] }>(
      `${repoPath(repoId)}?state=${encodeURIComponent(state)}`,
      { headers: headers() },
    )
    return response.pullRequests
  },

  async get(repoId: string, number: number): Promise<PullRequestDetail> {
    const response = await request<{ pullRequest: PullRequestDetail }>(
      repoPath(repoId, `/${number}`),
      { headers: headers() },
    )
    return response.pullRequest
  },

  diff(repoId: string, number: number): Promise<PullRequestDiff> {
    return request<PullRequestDiff>(
      repoPath(repoId, `/${number}/diff`),
      { headers: headers() },
    )
  },

  comment(repoId: string, number: number, body: string): Promise<{ ok: true }> {
    return request(repoPath(repoId, `/${number}/comments`), {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ body }),
    })
  },

  review(
    repoId: string,
    number: number,
    event: PullRequestReviewEvent,
    body: string,
  ): Promise<{ ok: true }> {
    return request(repoPath(repoId, `/${number}/reviews`), {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ event, body }),
    })
  },

  merge(
    repoId: string,
    number: number,
    method: PullRequestMergeMethod,
  ): Promise<{ ok: true }> {
    return request(repoPath(repoId, `/${number}/merge`), {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ method, deleteBranch: true }),
    })
  },

  resolveConflicts(
    repoId: string,
    number: number,
    resolution?: Record<string, PullRequestConflictSide>,
  ): Promise<PullRequestResolveResult> {
    return request(repoPath(repoId, `/${number}/resolve-conflicts`), {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ resolution }),
    })
  },

  update(
    repoId: string,
    number: number,
    input: { state?: 'open' | 'closed'; title?: string; body?: string },
  ): Promise<{ ok: true }> {
    return request(repoPath(repoId, `/${number}`), {
      method: 'PATCH',
      headers: headers(true),
      body: JSON.stringify(input),
    })
  },
}
