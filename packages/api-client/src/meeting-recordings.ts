import type { MeetingJob, MeetingSettings, MeetingSetup } from '@jait/shared';

export function createMeetingRecordingApi(fetchRequest: (path: string, init?: RequestInit) => Promise<Response>) {
  async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetchRequest('/api/meeting-recordings' + path, {
      method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null) as { message?: string; error?: string } | null;
      throw new Error(error?.message ?? error?.error ?? `Meeting recording request failed (${response.status}).`);
    }
    return response.json() as Promise<T>;
  }
  const jobPath = (id: string) => `/jobs/${encodeURIComponent(id)}`;
  return {
    settings: () => request<MeetingSetup>('/settings'),
    saveSettings: (settings: MeetingSettings & { obsidianToken?: string }) => request<MeetingSetup>('/settings', 'PUT', settings),
    test: () => request<{ service: string; ok: boolean }[]>('/test', 'POST'),
    latest: () => request<MeetingJob | null>('/jobs'),
    create: (input: { id: string; startedAt: string; totalBytes: number; mimeType: string }) => request<MeetingJob>('/jobs', 'POST', input),
    append: (id: string, offset: number, audio: string) => request<MeetingJob>(`${jobPath(id)}/audio`, 'PUT', { offset, audio }),
    submit: (id: string) => request<MeetingJob>(`${jobPath(id)}/submit`, 'POST'),
    retry: (id: string) => request<MeetingJob>(`${jobPath(id)}/retry`, 'POST'),
    discard: (id: string) => request<{ ok: true }>(jobPath(id), 'DELETE'),
  };
}
