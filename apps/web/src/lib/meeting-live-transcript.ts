import { MEETING_LIVE_DRAFT_MAX_LENGTH, type MeetingTranscriptReview } from '@jait/shared'
import { audioBase64, meetingRecordingApi } from './meeting-recording'
import type { MeetingPreviewClip } from './meeting-live-audio'

export interface LiveMeetingLine {
  id: string
  start: number
  speaker: string
  text: string
  edited?: boolean
}

export interface LiveMeetingSnapshot {
  lines: LiveMeetingLine[]
  queued: number
  partial?: { offset: number; text: string }
  hasGap: boolean
}

const empty: LiveMeetingSnapshot = { lines: [], queued: 0, hasGap: false }
export const emptyMeetingTranscript = empty

export function meetingTimestamp(seconds: number) {
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, Math.floor(seconds) % 60]
    .map(part => String(part).padStart(2, '0')).join(':')
}

function formatLines(lines: LiveMeetingLine[]) {
  return lines.flatMap(({ start, speaker, text }) => {
    const words = text.trim().replace(/\s+/g, ' ')
    return words ? [`[${meetingTimestamp(start)}] ${speaker.trim() ? `${speaker.trim()}: ` : ''}${words}`] : []
  }).join('\n')
}

function readDraft(key: string): { id: string; lines: LiveMeetingLine[]; nativeOffset: number; nativeTime: number } | undefined {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? undefined }
  catch { return undefined }
}

export class LiveMeetingTranscript {
  private readonly key: string
  private snapshot = empty
  private readonly finalClips: MeetingPreviewClip[] = []
  private pendingPartial?: MeetingPreviewClip
  private latestFinalOffset = -1
  private processing?: Promise<void>
  private active = true
  private stopped = false
  nativeOffset = 0
  nativeTime = 0
  nativePreviewDuration = 0

  constructor(owner: string, readonly id: string, fresh: boolean, private readonly onChange: (snapshot: LiveMeetingSnapshot) => void, private readonly owns: () => boolean) {
    this.key = `jait-live-meeting:${owner}`
    const stored = fresh ? undefined : readDraft(this.key)
    if (stored?.id === id) {
      this.nativeOffset = stored.nativeOffset
      this.nativeTime = stored.nativeTime
      this.snapshot = { ...empty, lines: stored.lines, hasGap: true }
    } else this.snapshot = { ...empty, hasGap: !fresh }
    this.publish(true)
  }

  private publish(saveDraft = false) {
    if (!this.active || !this.owns()) return
    this.onChange(this.snapshot)
    if (!saveDraft) return
    try {
      localStorage.setItem(this.key, JSON.stringify({
        id: this.id, lines: this.snapshot.lines, nativeOffset: this.nativeOffset, nativeTime: this.nativeTime,
      }))
    } catch { /* Capture and editing can continue without device storage. */ }
  }

  markGap() {
    this.snapshot = { ...this.snapshot, hasGap: true }
    this.publish()
  }

  push(clip: MeetingPreviewClip) {
    if (!this.active || this.stopped || !this.owns()) return
    if (clip.final) {
      this.latestFinalOffset = clip.offset
      this.pendingPartial = undefined
      if (this.snapshot.queued >= 2) {
        this.clearPartial(clip.offset)
        this.markGap()
        return
      }
      this.finalClips.push(clip)
      this.snapshot = { ...this.snapshot, queued: this.snapshot.queued + 1 }
      this.publish()
    } else {
      // Only the newest draft matters. Complete clips always take priority.
      this.pendingPartial = clip
    }
    this.processing ??= Promise.resolve().then(() => this.processClips())
  }

  private clearPartial(offset: number) {
    if (this.snapshot.partial?.offset === offset) this.snapshot = { ...this.snapshot, partial: undefined }
  }

  private async processClips() {
    try {
      while (this.active && this.owns()) {
        const clip = this.finalClips.shift() ?? this.pendingPartial
        if (!clip) break
        if (!clip.final) this.pendingPartial = undefined
        try {
          const audio = await audioBase64(clip.audio)
          if (!this.active || !this.owns()) return
          const speech = await meetingRecordingApi.preview(audio, clip.mimeType)
          if (!this.active || !this.owns()) return
          if (clip.final) {
            const lines = [...this.snapshot.lines, ...speech.map(segment => ({
              id: crypto.randomUUID(), start: segment.start + clip.offset, speaker: '', text: segment.text,
            }))]
            if (formatLines(lines).length > MEETING_LIVE_DRAFT_MAX_LENGTH) this.markGap()
            else this.snapshot = { ...this.snapshot, lines }
          } else if (!this.stopped && clip.offset > this.latestFinalOffset) {
            const text = speech.map(segment => segment.text).join(' ')
            if (text && text !== this.snapshot.partial?.text) {
              this.snapshot = { ...this.snapshot, partial: { offset: clip.offset, text } }
              this.publish()
            }
          }
        } catch {
          if (clip.final) this.markGap()
        } finally {
          if (clip.final) {
            this.clearPartial(clip.offset)
            this.snapshot = { ...this.snapshot, queued: this.snapshot.queued - 1 }
            this.publish(true)
          }
        }
      }
    } finally {
      this.processing = undefined
    }
  }

  edit(id: string, change: Partial<Pick<LiveMeetingLine, 'speaker' | 'text'>>, splitAt?: number) {
    if (!this.active || this.stopped) return
    const lines = this.snapshot.lines.flatMap(line => {
      if (line.id !== id) return [line]
      if (splitAt === undefined || splitAt <= 0 || splitAt >= line.text.length) return [{ ...line, ...change, edited: true }]
      return [
        { ...line, text: line.text.slice(0, splitAt).trimEnd(), edited: true },
        { ...line, id: crypto.randomUUID(), speaker: '', text: line.text.slice(splitAt).trimStart(), edited: true },
      ]
    })
    if (formatLines(lines).length > MEETING_LIVE_DRAFT_MAX_LENGTH) return
    this.snapshot = { ...this.snapshot, lines }
    this.publish(true)
  }

  async review(): Promise<MeetingTranscriptReview> {
    this.stopped = true
    this.pendingPartial = undefined
    await this.processing
    const { hasGap, lines } = this.snapshot
    return { complete: !hasGap, transcript: formatLines(hasGap ? lines.filter(line => line.edited) : lines) }
  }

  close(remove = false) {
    this.active = false
    if (remove && readDraft(this.key)?.id === this.id) {
      try { localStorage.removeItem(this.key) } catch { /* Storage may be unavailable. */ }
    }
  }
}
