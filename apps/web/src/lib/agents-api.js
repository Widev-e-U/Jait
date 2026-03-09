/**
 * API client for agent threads and providers.
 */
import { getApiUrl } from '@/lib/gateway-url';
const API_URL = getApiUrl();
// ── API Client ───────────────────────────────────────────────────────
export class AgentsApi {
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
    // ── Providers ──────────────────────────────────────────────────
    async listProviders() {
        const res = await fetch(`${API_URL}/api/providers`, {
            headers: this.getHeaders(),
        });
        if (!res.ok)
            throw new Error(`Failed to list providers: ${res.statusText}`);
        const data = await res.json();
        return data.providers;
    }
    async listProviderModels(providerId) {
        const res = await fetch(`${API_URL}/api/providers/${providerId}/models`, {
            headers: this.getHeaders(),
        });
        if (!res.ok)
            throw new Error(`Failed to list models: ${res.statusText}`);
        const data = await res.json();
        return data.models;
    }
    // ── Threads CRUD ───────────────────────────────────────────────
    async listThreads(sessionId) {
        const params = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
        const res = await fetch(`${API_URL}/api/threads${params}`, {
            headers: this.getHeaders(),
        });
        if (!res.ok)
            throw new Error(`Failed to list threads: ${res.statusText}`);
        const data = await res.json();
        return data.threads;
    }
    async getThread(id) {
        const res = await fetch(`${API_URL}/api/threads/${id}`, {
            headers: this.getHeaders(),
        });
        if (!res.ok)
            throw new Error(`Failed to get thread: ${res.statusText}`);
        return res.json();
    }
    async createThread(params) {
        const res = await fetch(`${API_URL}/api/threads`, {
            method: 'POST',
            headers: this.getHeaders(true),
            body: JSON.stringify(params),
        });
        if (!res.ok)
            throw new Error(`Failed to create thread: ${res.statusText}`);
        return res.json();
    }
    async updateThread(id, params) {
        const res = await fetch(`${API_URL}/api/threads/${id}`, {
            method: 'PATCH',
            headers: this.getHeaders(true),
            body: JSON.stringify(params),
        });
        if (!res.ok)
            throw new Error(`Failed to update thread: ${res.statusText}`);
        return res.json();
    }
    async deleteThread(id) {
        const res = await fetch(`${API_URL}/api/threads/${id}`, {
            method: 'DELETE',
            headers: this.getHeaders(),
        });
        if (!res.ok)
            throw new Error(`Failed to delete thread: ${res.statusText}`);
    }
    // ── Lifecycle ──────────────────────────────────────────────────
    async startThread(id, options) {
        // Accept plain string (message) for backwards compat, or options object
        const body = typeof options === 'string'
            ? { message: options }
            : options ?? {};
        const res = await fetch(`${API_URL}/api/threads/${id}/start`, {
            method: 'POST',
            headers: this.getHeaders(true),
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Failed to start thread: ${res.statusText}`);
        }
        return res.json();
    }
    async sendTurn(id, message) {
        const res = await fetch(`${API_URL}/api/threads/${id}/send`, {
            method: 'POST',
            headers: this.getHeaders(true),
            body: JSON.stringify({ message }),
        });
        if (!res.ok)
            throw new Error(`Failed to send turn: ${res.statusText}`);
    }
    async stopThread(id) {
        const res = await fetch(`${API_URL}/api/threads/${id}/stop`, {
            method: 'POST',
            headers: this.getHeaders(),
        });
        if (!res.ok)
            throw new Error(`Failed to stop thread: ${res.statusText}`);
    }
    async interruptThread(id) {
        const res = await fetch(`${API_URL}/api/threads/${id}/interrupt`, {
            method: 'POST',
            headers: this.getHeaders(),
        });
        if (!res.ok)
            throw new Error(`Failed to interrupt thread: ${res.statusText}`);
    }
    async approveToolCall(id, requestId, approved) {
        const res = await fetch(`${API_URL}/api/threads/${id}/approve`, {
            method: 'POST',
            headers: this.getHeaders(true),
            body: JSON.stringify({ requestId, approved }),
        });
        if (!res.ok)
            throw new Error(`Failed to approve: ${res.statusText}`);
    }
    async createPullRequest(id, params) {
        const res = await fetch(`${API_URL}/api/threads/${id}/create-pr`, {
            method: 'POST',
            headers: this.getHeaders(true),
            body: JSON.stringify(params),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Failed to create pull request: ${res.statusText}`);
        }
        return res.json();
    }
    // ── Activities ─────────────────────────────────────────────────
    async getActivities(threadId, limit) {
        const params = typeof limit === 'number' ? `?limit=${limit}` : '';
        const res = await fetch(`${API_URL}/api/threads/${threadId}/activities${params}`, {
            headers: this.getHeaders(),
        });
        if (!res.ok)
            throw new Error(`Failed to get activities: ${res.statusText}`);
        const data = await res.json();
        return data.activities;
    }
    // ── Repositories ──────────────────────────────────────────────
    async listRepos() {
        const res = await fetch(`${API_URL}/api/repos`, {
            headers: this.getHeaders(),
        });
        if (!res.ok)
            throw new Error(`Failed to list repos: ${res.statusText}`);
        const data = await res.json();
        return data.repos;
    }
    async createRepo(params) {
        const res = await fetch(`${API_URL}/api/repos`, {
            method: 'POST',
            headers: this.getHeaders(true),
            body: JSON.stringify(params),
        });
        if (!res.ok)
            throw new Error(`Failed to create repo: ${res.statusText}`);
        const data = await res.json();
        return data.repo;
    }
    async updateRepo(id, params) {
        const res = await fetch(`${API_URL}/api/repos/${id}`, {
            method: 'PATCH',
            headers: this.getHeaders(true),
            body: JSON.stringify(params),
        });
        if (!res.ok)
            throw new Error(`Failed to update repo: ${res.statusText}`);
        const data = await res.json();
        return data.repo;
    }
    async deleteRepo(id) {
        const res = await fetch(`${API_URL}/api/repos/${id}`, {
            method: 'DELETE',
            headers: this.getHeaders(),
        });
        if (!res.ok)
            throw new Error(`Failed to delete repo: ${res.statusText}`);
    }
}
export const agentsApi = new AgentsApi();
//# sourceMappingURL=agents-api.js.map