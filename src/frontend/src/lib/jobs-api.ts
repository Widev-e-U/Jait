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
  started_at: string
  completed_at: string | null
  result: string | null
  error: string | null
}

export interface JobsListResponse {
  items: ScheduledJob[]
  total: number
  page: number
  size: number
}

export interface JobRunsListResponse {
  items: JobRun[]
  total: number
  page: number
  size: number
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

export interface Provider {
  id: string
  name: string
  model: string
  available: boolean
}

class JobsApi {
  private getHeaders(token?: string): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  async listJobs(token: string, page = 1, size = 20, includeDisabled = false): Promise<JobsListResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      size: size.toString(),
      include_disabled: includeDisabled.toString(),
    })
    
    const response = await fetch(`${API_URL}/jobs?${params}`, {
      headers: this.getHeaders(token),
    })
    
    if (!response.ok) {
      throw new Error(`Failed to list jobs: ${response.statusText}`)
    }
    
    return response.json()
  }

  async getJob(token: string, jobId: string): Promise<ScheduledJob> {
    const response = await fetch(`${API_URL}/jobs/${jobId}`, {
      headers: this.getHeaders(token),
    })
    
    if (!response.ok) {
      throw new Error(`Failed to get job: ${response.statusText}`)
    }
    
    return response.json()
  }

  async createJob(token: string, data: CreateJobRequest): Promise<ScheduledJob> {
    const response = await fetch(`${API_URL}/jobs`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify(data),
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }))
      throw new Error(error.detail || 'Failed to create job')
    }
    
    return response.json()
  }

  async updateJob(token: string, jobId: string, data: UpdateJobRequest): Promise<ScheduledJob> {
    const response = await fetch(`${API_URL}/jobs/${jobId}`, {
      method: 'PATCH',
      headers: this.getHeaders(token),
      body: JSON.stringify(data),
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }))
      throw new Error(error.detail || 'Failed to update job')
    }
    
    return response.json()
  }

  async deleteJob(token: string, jobId: string): Promise<void> {
    const response = await fetch(`${API_URL}/jobs/${jobId}`, {
      method: 'DELETE',
      headers: this.getHeaders(token),
    })
    
    if (!response.ok) {
      throw new Error(`Failed to delete job: ${response.statusText}`)
    }
  }

  async triggerJob(token: string, jobId: string): Promise<void> {
    const response = await fetch(`${API_URL}/jobs/${jobId}/trigger`, {
      method: 'POST',
      headers: this.getHeaders(token),
    })
    
    if (!response.ok) {
      throw new Error(`Failed to trigger job: ${response.statusText}`)
    }
  }

  async getJobRuns(token: string, jobId: string, page = 1, size = 20): Promise<JobRunsListResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      size: size.toString(),
    })
    
    const response = await fetch(`${API_URL}/jobs/${jobId}/runs?${params}`, {
      headers: this.getHeaders(token),
    })
    
    if (!response.ok) {
      throw new Error(`Failed to get job runs: ${response.statusText}`)
    }
    
    return response.json()
  }

  async getAvailableProviders(token: string): Promise<{ providers: Provider[] }> {
    const response = await fetch(`${API_URL}/jobs/providers/available`, {
      headers: this.getHeaders(token),
    })
    
    if (!response.ok) {
      throw new Error(`Failed to get providers: ${response.statusText}`)
    }
    
    return response.json()
  }
}

export const jobsApi = new JobsApi()
