/**
 * API client for scheduled jobs
 */
import { getApiUrl } from '@/lib/gateway-url';
const API_URL = getApiUrl();
export class JobsApi {
    getToken() {
        return localStorage.getItem('token');
    }
    getHeaders(withJsonBody = false) {
        const headers = {};
        if (withJsonBody) {
            headers['Content-Type'] = 'application/json';
        }
        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }
    async listJobsPage(page = 1, size = 20, includeDisabled = true) {
        const params = new URLSearchParams({
            page: page.toString(),
            size: size.toString(),
            include_disabled: includeDisabled.toString(),
        });
        const response = await fetch(`${API_URL}/jobs?${params}`, {
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            throw new Error(`Failed to list jobs: ${response.statusText}`);
        }
        const data = await response.json();
        if (Array.isArray(data)) {
            return {
                items: data,
                total: data.length,
                page: 1,
                size: data.length,
            };
        }
        const record = data && typeof data === 'object' ? data : {};
        const rawItems = Array.isArray(record.items) ? record.items : [];
        const total = typeof record.total === 'number' ? record.total : rawItems.length;
        const currentPage = typeof record.page === 'number' ? record.page : page;
        const currentSize = typeof record.size === 'number' ? record.size : size;
        return {
            items: rawItems,
            total,
            page: currentPage,
            size: currentSize,
        };
    }
    async listJobs(page = 1, size = 100, includeDisabled = true) {
        const result = await this.listJobsPage(page, size, includeDisabled);
        return result.items;
    }
    async getJob(jobId) {
        const response = await fetch(`${API_URL}/jobs/${jobId}`, {
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            throw new Error(`Failed to get job: ${response.statusText}`);
        }
        return response.json();
    }
    async createJob(data) {
        const response = await fetch(`${API_URL}/jobs`, {
            method: 'POST',
            headers: this.getHeaders(true),
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(error.detail || 'Failed to create job');
        }
        return response.json();
    }
    async updateJob(jobId, data) {
        const response = await fetch(`${API_URL}/jobs/${jobId}`, {
            method: 'PATCH',
            headers: this.getHeaders(true),
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(error.detail || 'Failed to update job');
        }
        return response.json();
    }
    async deleteJob(jobId) {
        const response = await fetch(`${API_URL}/jobs/${jobId}`, {
            method: 'DELETE',
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            throw new Error(`Failed to delete job: ${response.statusText}`);
        }
    }
    async triggerJob(jobId) {
        const response = await fetch(`${API_URL}/jobs/${jobId}/trigger`, {
            method: 'POST',
            headers: this.getHeaders(true),
            body: JSON.stringify({}),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(error.detail || `Failed to trigger job: ${response.statusText}`);
        }
        return response.json();
    }
    async getJobRuns(jobId, size = 20, page = 1) {
        const params = new URLSearchParams({
            page: page.toString(),
            size: size.toString(),
        });
        const response = await fetch(`${API_URL}/jobs/${jobId}/runs?${params}`, {
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            throw new Error(`Failed to get job runs: ${response.statusText}`);
        }
        const data = await response.json();
        return Array.isArray(data) ? data : data.items ?? [];
    }
    async getAvailableProviders() {
        const response = await fetch(`${API_URL}/jobs/providers/available`, {
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            throw new Error(`Failed to get providers: ${response.statusText}`);
        }
        const data = await response.json();
        if (data.providers && !Array.isArray(data.providers)) {
            return data.providers;
        }
        return data;
    }
}
export const jobsApi = new JobsApi();
//# sourceMappingURL=jobs-api.js.map