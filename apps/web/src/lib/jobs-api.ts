/**
 * API client for scheduled jobs
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface ScheduledJob {
  id: string
  user_id: string | null
  name: string
  description: string | null
  cron_expression: string
  job_type: string
  prompt: string | null
  provider: string | null
  model: string | null
  enabled: boolean
  temporal_schedule_id: string | null
  created_at: string
  updated_at: string
}

export interface JobRun {
  id: string
  job_id: string
  status: string
  triggered_by?: string
  started_at: string
  completed_at: string | null
  result: string | null
  error: string | null
}

export type JobType = 'agent_task' | 'system_job'

export interface CreateJobRequest {
  name: string
  description?: string
  cron_expression: string
  job_type?: JobType
  prompt?: string
  payload?: Record<string, unknown>
  provider?: string
  model?: string
  enabled?: boolean
}

export interface UpdateJobRequest {
  name?: string
  description?: string
  cron_expression?: string
  prompt?: string
  provider?: string
  model?: string
  enabled?: boolean
}

export interface ProviderInfo {
  name: string
  models: string[]
}

export class JobsApi {
  private getToken(): string | null {
    return localStorage.getItem('auth_token')
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }
    const token = this.getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  async listJobs(page = 1, size = 100, includeDisabled = true): Promise<ScheduledJob[]> {
    const params = new URLSearchParams({
      page: page.toString(),
      size: size.toString(),
      include_disabled: includeDisabled.toString(),
    })

    const response = await fetch(`${API_URL}/jobs?${params}`, {
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to list jobs: ${response.statusText}`)
    }

    const data = await response.json()
    return Array.isArray(data) ? data : data.items ?? []
  }

  async getJob(jobId: string): Promise<ScheduledJob> {
    const response = await fetch(`${API_URL}/jobs/${jobId}`, {
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to get job: ${response.statusText}`)
    }

    return response.json()
  }

  async createJob(data: CreateJobRequest): Promise<ScheduledJob> {
    const response = await fetch(`${API_URL}/jobs`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }))
      throw new Error(error.detail || 'Failed to create job')
    }

    return response.json()
  }

  async updateJob(jobId: string, data: UpdateJobRequest): Promise<ScheduledJob> {
    const response = await fetch(`${API_URL}/jobs/${jobId}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }))
      throw new Error(error.detail || 'Failed to update job')
    }

    return response.json()
  }

  async deleteJob(jobId: string): Promise<void> {
    const response = await fetch(`${API_URL}/jobs/${jobId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to delete job: ${response.statusText}`)
    }
  }

  async triggerJob(jobId: string): Promise<JobRun> {
    const response = await fetch(`${API_URL}/jobs/${jobId}/trigger`, {
      method: 'POST',
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to trigger job: ${response.statusText}`)
    }

    return response.json()
  }

  async getJobRuns(jobId: string, size = 20, page = 1): Promise<JobRun[]> {
    const params = new URLSearchParams({
      page: page.toString(),
      size: size.toString(),
    })

    const response = await fetch(`${API_URL}/jobs/${jobId}/runs?${params}`, {
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to get job runs: ${response.statusText}`)
    }

    const data = await response.json()
    return Array.isArray(data) ? data : data.items ?? []
  }

  async getAvailableProviders(): Promise<Record<string, ProviderInfo>> {
    const response = await fetch(`${API_URL}/jobs/providers/available`, {
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to get providers: ${response.statusText}`)
    }

    const data = await response.json()
    if (data.providers && !Array.isArray(data.providers)) {
      return data.providers
    }
    return data
  }
}

export const jobsApi = new JobsApi()
