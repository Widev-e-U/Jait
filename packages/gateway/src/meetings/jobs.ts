import { MEETING_UPLOAD_CHUNK, type MeetingJob, type MeetingTranscriptReview } from "@jait/shared";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import { MeetingEndpoints, type MeetingConfiguration } from "./endpoints.js";

interface Recording {
  id: string;
  user_id: string;
  started_at: string;
  stage: MeetingJob["stage"];
  mime_type: string;
  total_bytes: number;
  uploaded_bytes: number;
  transcript: string | null;
  live_edits: string | null;
  auto_save: number;
  summary: string | null;
  note_path: string | null;
  note_url: string | null;
  error: string | null;
}

export class MeetingJobs {
  private readonly shutdown = new AbortController();
  private active?: Promise<void>;

  constructor(private readonly db: SqliteDatabase, private readonly settings: (userId: string) => MeetingConfiguration) {}

  private row(userId: string, id?: string): Recording | undefined {
    return (id
      ? this.db.prepare("SELECT * FROM meeting_recordings WHERE user_id = ? AND id = ?").get(userId, id)
      : this.db.prepare("SELECT * FROM meeting_recordings WHERE user_id = ? ORDER BY (stage <> 'complete') DESC, created_at DESC LIMIT 1").get(userId)) as Recording | undefined;
  }

  get(userId: string, id?: string): MeetingJob | null {
    const row = this.row(userId, id);
    return row ? { id: row.id, stage: row.stage, startedAt: row.started_at, uploadedBytes: row.uploaded_bytes,
      transcript: row.stage === "reviewing" ? row.transcript ?? "" : undefined,
      notePath: row.note_path ?? undefined, noteUrl: row.note_url ?? undefined, error: row.error ?? undefined } : null;
  }

  create(userId: string, input: { id: string; startedAt: string; totalBytes: number; mimeType: string }): MeetingJob | null {
    const existing = this.row(userId, input.id);
    if (existing) return existing.total_bytes === input.totalBytes && existing.mime_type === input.mimeType ? this.get(userId, input.id) : null;
    this.db.prepare(`INSERT OR IGNORE INTO meeting_recordings
      (id, user_id, started_at, stage, mime_type, total_bytes, created_at) VALUES (?, ?, ?, 'uploading', ?, ?, ?)`)
      .run(input.id, userId, input.startedAt, input.mimeType, input.totalBytes, new Date().toISOString());
    return this.get(userId, input.id);
  }

  append(userId: string, id: string, offset: number, bytes: Buffer): MeetingJob | null {
    const row = this.row(userId, id);
    if (!row) return null;
    // A response lost after a committed append can be retried at the same offset.
    if (offset < row.uploaded_bytes && offset + bytes.length <= row.uploaded_bytes) return this.get(userId, id);
    if (row.stage !== "uploading" || offset !== row.uploaded_bytes || offset >= row.total_bytes
      || bytes.length !== Math.min(MEETING_UPLOAD_CHUNK, row.total_bytes - offset)) return null;
    this.db.transaction(() => {
      this.db.prepare("INSERT INTO meeting_recording_chunks VALUES (?, ?, ?)").run(id, offset, bytes);
      this.db.prepare("UPDATE meeting_recordings SET uploaded_bytes = ? WHERE id = ?").run(offset + bytes.length, id);
    }).immediate();
    return this.get(userId, id);
  }

  submit(userId: string, id: string, retry = false, review?: MeetingTranscriptReview): MeetingJob | null {
    const row = this.row(userId, id);
    if (!row || row.total_bytes !== row.uploaded_bytes) return null;
    if (row.stage === "uploading" && !retry && review?.complete) {
      this.checkpointTranscript(id, review.transcript, review.autoSave ? "summarizing" : "reviewing");
      this.start();
    } else if (row.stage === (retry ? "failed" : "uploading")) {
      const stage = row.summary ? "saving" : row.transcript !== null ? "summarizing" : "transcribing";
      this.db.prepare("UPDATE meeting_recordings SET stage = ?, live_edits = ?, auto_save = ?, error = NULL WHERE id = ?")
        .run(stage, review?.transcript ?? row.live_edits, review ? Number(review.autoSave === true) : row.auto_save, id);
      this.start();
    }
    return this.get(userId, id);
  }

  save(userId: string, id: string, transcript: string): MeetingJob | null {
    const row = this.row(userId, id);
    if (!row) return null;
    if (row.stage === "reviewing") {
      this.db.prepare("UPDATE meeting_recordings SET transcript = ?, stage = 'summarizing' WHERE id = ?").run(transcript, id);
      this.start();
    } else if (!["summarizing", "saving", "complete"].includes(row.stage)) return null;
    return this.get(userId, id);
  }

  private checkpointTranscript(id: string, transcript: string, stage: "reviewing" | "summarizing"): void {
    this.db.transaction(() => {
      this.db.prepare("UPDATE meeting_recordings SET transcript = ?, live_edits = NULL, stage = ? WHERE id = ?").run(transcript, stage, id);
      this.db.prepare("DELETE FROM meeting_recording_chunks WHERE recording_id = ?").run(id);
    }).immediate();
  }

  discard(userId: string, id: string): boolean {
    const row = this.row(userId, id);
    if (row?.stage !== "uploading" && row?.stage !== "failed" && row?.stage !== "reviewing") return false;
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM meeting_recording_chunks WHERE recording_id = ?").run(id);
      this.db.prepare("DELETE FROM meeting_recordings WHERE id = ?").run(id);
    }).immediate();
    return true;
  }

  start(): void {
    if (this.active || this.shutdown.signal.aborted) return;
    const next = this.db.prepare("SELECT * FROM meeting_recordings WHERE stage IN ('transcribing', 'summarizing', 'saving') ORDER BY created_at LIMIT 1").get() as Recording | undefined;
    if (!next) return;
    this.active = this.process(next).finally(() => {
      this.active = undefined;
      this.start();
    });
  }

  async close(): Promise<void> {
    this.shutdown.abort();
    await this.active;
  }

  private async process(row: Recording): Promise<void> {
    let stage = row.stage;
    try {
      const endpoints = new MeetingEndpoints(this.settings(row.user_id), this.shutdown.signal);
      let transcript = row.transcript;
      if (transcript === null) {
        const chunks = this.db.prepare("SELECT audio FROM meeting_recording_chunks WHERE recording_id = ? ORDER BY byte_offset").all(row.id) as { audio: Uint8Array }[];
        transcript = await endpoints.transcribe(Buffer.concat(chunks.map(chunk => chunk.audio)), row.mime_type, row.live_edits !== null);
        const needsReview = row.live_edits !== null && !row.auto_save;
        if (row.live_edits) transcript = `${transcript}\n\nLive edits and speaker assignments\n${row.live_edits}`.trim();
        this.checkpointTranscript(row.id, transcript, needsReview ? "reviewing" : "summarizing");
        if (needsReview) return;
      }
      stage = "summarizing";
      const summary = row.summary ?? (transcript ? await endpoints.summarize(transcript) : "## Summary\n\nNo speech was recorded.");
      this.db.prepare("UPDATE meeting_recordings SET summary = ?, stage = 'saving' WHERE id = ?").run(summary, row.id);
      stage = "saving";
      const path = `Meetings/${row.started_at.slice(0, 10)} Meeting ${row.id}.md`;
      const body = `# Meeting ${row.started_at.slice(0, 10)}\n\nRecorded at ${row.started_at}\n\n${summary}\n\n## Transcript\n\n${transcript.split("\n").map(line => `    ${line}`).join("\n")}\n`;
      const url = await endpoints.saveNote(path, body);
      this.db.transaction(() => {
        this.db.prepare("UPDATE meeting_recordings SET stage = 'complete', note_path = ?, note_url = ?, transcript = NULL, summary = NULL WHERE id = ?").run(path, url, row.id);
        this.db.prepare(`DELETE FROM meeting_recordings WHERE user_id = ? AND stage = 'complete' AND id NOT IN
          (SELECT id FROM meeting_recordings WHERE user_id = ? AND stage = 'complete' ORDER BY created_at DESC LIMIT 20)`)
          .run(row.user_id, row.user_id);
      }).immediate();
    } catch {
      if (this.shutdown.signal.aborted) return;
      const message = stage === "transcribing" ? "Parakeet could not transcribe this recording."
        : stage === "summarizing" ? "Nemotron could not summarize this transcript." : "Obsidian could not save the note.";
      this.db.prepare("UPDATE meeting_recordings SET stage = 'failed', error = ? WHERE id = ?").run(message, row.id);
    }
  }
}
