/**
 * API client for scheduled jobs
 */
export interface ScheduledJob {
    id: string;
    user_id: string | null;
    name: string;
    description: string | null;
    cron_expression: string;
    job_type: string;
    tool_name?: string;
    payload?: Record<string, unknown> | null;
    prompt: string | null;
    provider: string | null;
    model: string | null;
    enabled: boolean;
    temporal_schedule_id: string | null;
    created_at: string;
    updated_at: string;
}
export interface JobRun {
    id: string;
    job_id: string;
    status: string;
    triggered_by?: string;
    started_at: string;
    completed_at: string | null;
    result: string | null;
    error: string | null;
}
export type JobType = 'agent_task' | 'system_job';
export interface CreateJobRequest {
    name: string;
    description?: string;
    cron_expression: string;
    job_type?: JobType;
    prompt?: string;
    payload?: Record<string, unknown>;
    provider?: string;
    model?: string;
    enabled?: boolean;
}
export interface UpdateJobRequest {
    name?: string;
    description?: string;
    cron_expression?: string;
    job_type?: JobType;
    prompt?: string;
    payload?: Record<string, unknown>;
    provider?: string;
    model?: string;
    enabled?: boolean;
}
export interface ProviderInfo {
    name: string;
    models: string[];
}
export interface PaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    size: number;
}
export declare class JobsApi {
    private getToken;
    private getHeaders;
    listJobsPage(page?: number, size?: number, includeDisabled?: boolean): Promise<PaginatedResult<ScheduledJob>>;
    listJobs(page?: number, size?: number, includeDisabled?: boolean): Promise<ScheduledJob[]>;
    getJob(jobId: string): Promise<ScheduledJob>;
    createJob(data: CreateJobRequest): Promise<ScheduledJob>;
    updateJob(jobId: string, data: UpdateJobRequest): Promise<ScheduledJob>;
    deleteJob(jobId: string): Promise<void>;
    triggerJob(jobId: string): Promise<JobRun>;
    getJobRuns(jobId: string, size?: number, page?: number): Promise<JobRun[]>;
    getAvailableProviders(): Promise<Record<string, ProviderInfo>>;
}
export declare const jobsApi: JobsApi;
//# sourceMappingURL=jobs-api.d.ts.map