export const MEETING_UPLOAD_CHUNK = 512 * 1024;
export const MEETING_MAX_BYTES = 96 * 1024 * 1024;
export const MEETING_MAX_SECONDS = 7200;
export const MEETING_PREVIEW_SECONDS = 8;
export const MEETING_LIVE_DRAFT_MAX_LENGTH = 256_000;
export const MEETING_TRANSCRIPT_MAX_LENGTH = 2 * 1024 * 1024 + MEETING_LIVE_DRAFT_MAX_LENGTH + 1024;

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

export type MeetingStage = 'uploading' | 'transcribing' | 'reviewing' | 'summarizing' | 'saving' | 'complete' | 'failed';

export interface MeetingJob {
  id: string;
  stage: MeetingStage;
  uploadedBytes: number;
  startedAt: string;
  transcript?: string;
  notePath?: string;
  noteUrl?: string;
  error?: string;
}

export interface MeetingSpeechSegment {
  start: number;
  text: string;
}

export interface MeetingTranscriptReview {
  /** Save to Obsidian after transcription without waiting for manual review. */
  autoSave?: boolean;
  /** True when the live draft covers the recording and can be reviewed directly. */
  complete: boolean;
  /** The full live draft, or just the user's live edits when batch recovery is needed. */
  transcript: string;
}
