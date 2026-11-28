import { registerPlugin, Capacitor } from '@capacitor/core'
import { MEETING_MAX_BYTES, MEETING_MAX_SECONDS, MEETING_UPLOAD_CHUNK, type MeetingJob, type MeetingSetup } from '@jait/shared'
import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import { audioBase64, meetingAudioStore, meetingRecordingApi, type LocalMeetingAudio } from '@/lib/meeting-recording'
import { mixWindowsMeetingPlayback } from '@/lib/meeting-playback'
import { getApiUrl } from '@/lib/gateway-url'
import { androidPreviewFrames, startMeetingAudioPreview } from '@/lib/meeting-live-audio'
import { emptyMeetingTranscript, LiveMeetingTranscript, type LiveMeetingLine } from '@/lib/meeting-live-transcript'

interface NativeState { phase: 'idle' | 'recording' | 'ready' | 'failed'; startedAt?: number; id?: string; size?: number; mimeType?: string }
const AndroidMeeting = registerPlugin<{
  start: (options: { id: string; owner: string }) => Promise<void>
  stop: (options: { owner: string }) => Promise<void>
  state: (options: { owner: string }) => Promise<NativeState>
  read: (options: { offset: number; length: number; owner: string; preview?: boolean }) => Promise<{ audio: string }>
  discard: (options: { owner: string }) => Promise<void>
  openNote: (options: { url: string }) => Promise<void>
}>('MeetingRecorder')

type PendingAudio = { id: string; startedAt: string; size: number; mimeType: string; read: (offset: number) => Promise<string>; cleanup: () => Promise<unknown> }
const activeStages = ['transcribing', 'summarizing', 'saving']

export function useMeetingRecording(userId: string | undefined, platform: 'web' | 'desktop' | 'capacitor') {
  const owner = userId ? `${getApiUrl()}:${userId}` : ''
  const native = platform === 'capacitor' && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('MeetingRecorder')
  const [setup, setSetup] = useState<MeetingSetup>()
  const [job, setJob] = useState<MeetingJob | null>(null)
  const [phase, setPhase] = useState<'idle' | 'starting' | 'recording' | 'uploading'>('idle')
  const [started, setStarted] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [pending, setPending] = useState<PendingAudio>()
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [transcript, setTranscript] = useState(emptyMeetingTranscript)
  const [saving, setSaving] = useState(false)
  const [reviewEdit, setReviewEdit] = useState<{ id: string; text: string }>()
  const live = useRef<LiveMeetingTranscript | null>(null)
  const operation = useRef(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const liveOwner = useRef(owner)
  const previousNativeState = useRef<NativeState['phase']>('idle')
  liveOwner.current = owner

  const storeAudio = useCallback((recording: LocalMeetingAudio): PendingAudio => ({
    id: recording.id, startedAt: recording.startedAt, size: recording.audio.size, mimeType: recording.audio.type,
    read: offset => audioBase64(recording.audio.slice(offset, offset + MEETING_UPLOAD_CHUNK)),
    cleanup: () => meetingAudioStore(owner, 'delete'),
  }), [owner])

  const getDraft = useCallback((id: string, fresh = false) => {
    if (live.current?.id === id) return live.current
    live.current?.close()
    const draft = new LiveMeetingTranscript(owner, id, fresh, snapshot => {
      setTranscript(snapshot)
    }, () => liveOwner.current === owner)
    live.current = draft
    return draft
  }, [owner])

  useEffect(() => {
    previousNativeState.current = 'idle'
    live.current?.close()
    live.current = null
    setOpen(false); setTranscript(emptyMeetingTranscript); setSaving(false); setReviewEdit(undefined)
    setSetup(undefined); setJob(null); setPending(undefined); setPhase('idle'); setError('')
    if (!owner) return
    let ignore = false
    void meetingRecordingApi.settings().then(result => { if (!ignore) setSetup(result) }).catch(() => {})
    void meetingRecordingApi.latest().then(result => { if (!ignore) { setJob(result); if (result?.stage === 'reviewing') setOpen(true) } }).catch(() => {})
    if (platform === 'desktop') void meetingAudioStore(owner, 'read').then(recording => {
      if (!ignore && recording) setPending(storeAudio(recording))
    }).catch(() => {})
    return () => { ignore = true }
  }, [owner, platform, storeAudio])

  const upload = useCallback(async (audio: PendingAudio) => {
    if (operation.current || !owner || liveOwner.current !== owner) return
    operation.current = true
    setPhase('uploading'); setError('')
    try {
      let current = await meetingRecordingApi.create({ id: audio.id, startedAt: audio.startedAt, totalBytes: audio.size, mimeType: audio.mimeType })
      if (liveOwner.current !== owner) return
      setJob(current)
      while (current.stage === 'uploading' && current.uploadedBytes < audio.size && liveOwner.current === owner) {
        const chunk = await audio.read(current.uploadedBytes)
        if (liveOwner.current !== owner) return
        current = await meetingRecordingApi.append(audio.id, current.uploadedBytes, chunk)
        if (liveOwner.current === owner) setJob(current)
      }
      if (liveOwner.current !== owner) return
      if (current.stage === 'uploading') {
        const review = await getDraft(audio.id).review()
        if (liveOwner.current !== owner) return
        current = await meetingRecordingApi.submit(audio.id, { ...review, autoSave: true })
      }
      if (liveOwner.current !== owner) return
      setJob(current); setPending(undefined)
      if (live.current?.id === audio.id) live.current.close(true)
      await audio.cleanup().catch(() => {})
    } catch (failure) {
      if (liveOwner.current === owner) setError(String((failure as Error).message ?? failure))
    } finally {
      operation.current = false
      if (liveOwner.current === owner) setPhase('idle')
    }
  }, [owner, getDraft])

  useEffect(() => {
    if (!native || !owner || (!setup?.configured && previousNativeState.current === 'idle')) return
    let ignore = false
    let syncing = false
    const sync = async () => {
      const state = await AndroidMeeting.state({ owner })
      if (ignore || liveOwner.current !== owner) return
      const previous = previousNativeState.current
      if (state.phase !== 'ready') previousNativeState.current = state.phase
      if (state.phase === 'failed' && previous !== 'failed') {
        setPhase('idle'); setError('Android could not record from the microphone.')
        return
      }
      const { id, startedAt, size = 0, mimeType = 'audio/mp4' } = state
      if (!id || !startedAt || (state.phase !== 'recording' && (state.phase !== 'ready' || previous === 'ready'))) return
      const ready = state.phase === 'ready'
      if (live.current?.id !== id && !ready) setOpen(true)
      const draft = getDraft(id)
      if (!ready) {
        setStarted(startedAt); setPhase('recording')
      } else setPhase('uploading')
      if (mimeType === 'audio/aac') {
        try {
          // Regular ticks consume one complete clip. After stop, also read the tail.
          for (let clip = 0; clip < (ready ? 3 : 1) && draft.nativeOffset < size; clip++) {
            const { audio } = await AndroidMeeting.read({ offset: draft.nativeOffset,
              length: Math.min(MEETING_UPLOAD_CHUNK, size - draft.nativeOffset), owner, preview: true })
            if (ignore || liveOwner.current !== owner) return
            const frames = androidPreviewFrames(audio, ready, draft.nativePreviewDuration)
            if (!frames) break
            const offset = draft.nativeTime
            draft.nativePreviewDuration = frames.final ? 0 : frames.duration
            if (frames.final) {
              draft.nativeOffset += frames.length
              draft.nativeTime += frames.duration
            }
            draft.push({ offset, mimeType, audio: frames.audio, final: frames.final })
          }
          if (ready && draft.nativeOffset !== size) draft.markGap()
        } catch { draft.markGap() }
      } else draft.markGap()
      if (ready && !ignore && liveOwner.current === owner) {
        previousNativeState.current = state.phase
        if (!size) { setPhase('idle'); setError('No usable audio was captured.'); return }
        const audio = { id, startedAt: new Date(startedAt).toISOString(), size, mimeType,
          read: async (offset: number) => (await AndroidMeeting.read({ offset, length: Math.min(MEETING_UPLOAD_CHUNK, size - offset), owner })).audio,
          cleanup: () => AndroidMeeting.discard({ owner }),
        }
        setPending(audio)
        if (previous === 'recording') void upload(audio)
        else setPhase('idle')
      }
    }
    const tick = () => {
      if (syncing) return
      syncing = true
      void sync().catch(() => {}).finally(() => { syncing = false })
    }
    tick()
    const interval = window.setInterval(tick, 750)
    return () => { ignore = true; window.clearInterval(interval) }
  }, [native, owner, setup?.configured, upload, getDraft])

  useEffect(() => {
    if (!owner || !job || !activeStages.includes(job.stage)) return
    let ignore = false
    const timer = window.setInterval(() => {
      void meetingRecordingApi.latest().then(next => { if (!ignore) setJob(next) }).catch(() => {})
    }, 2000)
    return () => { ignore = true; window.clearInterval(timer) }
  }, [owner, job?.stage, job?.id])

  useEffect(() => {
    if (phase !== 'recording') return
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [phase, started])

  const stop = useCallback(async () => {
    if (native) await AndroidMeeting.stop({ owner }).catch(() => setError('Could not stop the recording.'))
    else if (recorder.current?.state === 'recording') recorder.current.stop()
  }, [native, owner])

  useEffect(() => {
    if (seconds >= MEETING_MAX_SECONDS && phase === 'recording') void stop()
  }, [seconds, phase, stop])

  useEffect(() => () => {
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }, [owner])

  async function start() {
    if (!setup?.configured || !owner || operation.current || phase !== 'idle' || pending || (job && job.stage !== 'complete')) return
    setError(''); setPhase('starting'); setSeconds(0); setOpen(true)
    const id = crypto.randomUUID()
    const startedAt = new Date().toISOString()
    const draft = getDraft(id, true)
    let stream: MediaStream | undefined
    let releasePlayback: (() => void) | undefined
    let playbackInterrupted = false
    let preview: Awaited<ReturnType<typeof startMeetingAudioPreview>> | undefined
    try {
      if (native) {
        previousNativeState.current = 'idle'
        await AndroidMeeting.start({ id, owner })
        if (liveOwner.current === owner) { setStarted(Date.now()); setPhase('recording') }
        return
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Microphone recording is unavailable on this device.')
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      if (liveOwner.current !== owner) { stream.getTracks().forEach(track => track.stop()); return }
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type))
      const mixed = await mixWindowsMeetingPlayback(stream, () => {
        playbackInterrupted = true
        if (recorder.current?.state === 'recording') recorder.current.stop()
      })
      releasePlayback = mixed.release
      if (liveOwner.current !== owner) {
        releasePlayback(); stream.getTracks().forEach(track => track.stop()); return
      }
      try { preview = await startMeetingAudioPreview(mixed.stream, clip => draft.push(clip)) }
      catch { draft.markGap() }
      if (liveOwner.current !== owner) {
        void preview?.finish().catch(() => {})
        releasePlayback(); stream.getTracks().forEach(track => track.stop()); return
      }
      const capture = new MediaRecorder(mixed.stream, { mimeType, audioBitsPerSecond: 64_000 })
      const chunks: Blob[] = []
      let bytes = 0
      const release = () => { recorder.current = null; releasePlayback?.(); stream?.getTracks().forEach(track => track.stop()) }
      capture.ondataavailable = event => {
        if (!event.data.size) return
        chunks.push(event.data); bytes += event.data.size
        if (bytes >= MEETING_MAX_BYTES - MEETING_UPLOAD_CHUNK && capture.state === 'recording') capture.stop()
      }
      capture.onerror = () => {
        if (liveOwner.current === owner) setError('The device stopped recording audio.')
      }
      capture.onstop = async () => {
        if (liveOwner.current === owner) setPhase('uploading')
        try { if (preview && !await preview.finish()) draft.markGap() }
        catch { draft.markGap() }
        release()
        if (liveOwner.current !== owner) return
        if (!bytes || bytes > MEETING_MAX_BYTES) { setPhase('idle'); setError('No usable audio was captured.'); return }
        const recording = { id, startedAt, audio: new Blob(chunks, { type: capture.mimeType || mimeType || 'audio/webm' }) }
        const audio = storeAudio(recording)
        setPending(audio)
        void meetingAudioStore(owner, 'write', recording).catch(() => {}).then(() => {
          if (liveOwner.current !== owner) return
          if (playbackInterrupted) {
            setPhase('idle')
            setError('System audio was interrupted. You can upload the partial recording or discard it.')
          }
          else void upload(audio)
        })
      }
      recorder.current = capture
      capture.start(1000); preview?.start(); setStarted(Date.now()); setPhase('recording')
    } catch (failure) {
      void preview?.finish().catch(() => {})
      releasePlayback?.(); stream?.getTracks().forEach(track => track.stop())
      if (liveOwner.current !== owner) return
      setPhase('idle'); setError(String((failure as Error).message ?? failure))
    }
  }

  async function retry() {
    if (pending) return upload(pending)
    if (job?.stage !== 'failed' || operation.current) return
    operation.current = true; setError('')
    try { setJob(await meetingRecordingApi.retry(job.id)) }
    catch (failure) { setError(String((failure as Error).message ?? failure)) }
    finally { operation.current = false }
  }

  async function discard() {
    if (operation.current) return
    operation.current = true
    try {
      if (job && ['uploading', 'failed', 'reviewing'].includes(job.stage)) await meetingRecordingApi.discard(job.id)
      await pending?.cleanup()
      live.current?.close(true); live.current = null
      setTranscript(emptyMeetingTranscript); setOpen(false); setReviewEdit(undefined)
      setPending(undefined); setJob(null); setError(''); setPhase('idle')
    } catch (failure) { setError(String((failure as Error).message ?? failure)) }
    finally { operation.current = false }
  }

  async function saveTranscript(text: string) {
    if (operation.current || !owner || job?.stage !== 'reviewing') return
    operation.current = true; setSaving(true); setError('')
    try {
      const saved = await meetingRecordingApi.save(job.id, text)
      if (liveOwner.current === owner) { setReviewEdit(undefined); setJob(saved) }
    } catch (failure) {
      if (liveOwner.current === owner) setError(String((failure as Error).message ?? failure))
    } finally {
      operation.current = false
      if (liveOwner.current === owner) setSaving(false)
    }
  }

  function editLine(id: string, change: Partial<Pick<LiveMeetingLine, 'speaker' | 'text'>>, splitAt?: number) {
    live.current?.edit(id, change, splitAt)
  }

  const review = reviewEdit?.id === job?.id ? reviewEdit?.text ?? '' : job?.transcript ?? ''
  function editReview(text: string) {
    if (job?.stage === 'reviewing') setReviewEdit({ id: job.id, text })
  }

  async function openNote() {
    const openNativeNote = native ? (url: string) => AndroidMeeting.openNote({ url }) : window.jaitDesktop?.openMeetingNote
    if (job?.stage !== 'complete' || !job.noteUrl || !openNativeNote) return
    setError('')
    try { await openNativeNote(job.noteUrl) }
    catch { if (liveOwner.current === owner) setError('Obsidian could not open this note on this device.') }
  }

  return { setup, setSetup, job, phase, seconds, pending: !!pending, error, open, setOpen, transcript, saving, review, start, stop, retry, discard, editReview, saveTranscript, editLine, openNote, nativeApp: platform !== 'web' }
}

export const MeetingRecordingContext = createContext<ReturnType<typeof useMeetingRecording> | null>(null)
