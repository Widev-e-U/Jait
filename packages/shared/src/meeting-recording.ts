export const MEETING_UPLOAD_CHUNK = 512 * 1024;
export const MEETING_MAX_BYTES = 96 * 1024 * 1024;
export const MEETING_MAX_SECONDS = 7200;

export interface MeetingSettings {
  parakeetUrl: string;
  nemotronUrl: string;
  nemotronModel: string;
  obsidianUrl: string;
  obsidianVault: string;
}

export interface MeetingSetup extends MeetingSettings {
  configured: boolean;
  hasObsidianToken: boolean;
}

export type MeetingStage = 'uploading' | 'transcribing' | 'summarizing' | 'saving' | 'complete' | 'failed';

export interface MeetingJob {
  id: string;
  stage: MeetingStage;
  uploadedBytes: number;
  startedAt: string;
  notePath?: string;
  noteUrl?: string;
  error?: string;
}
