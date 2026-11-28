import { registerPlugin, Capacitor } from '@capacitor/core'
import { MEETING_MAX_BYTES, MEETING_MAX_SECONDS, MEETING_UPLOAD_CHUNK, type MeetingJob, type MeetingSetup } from '@jait/shared'
import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import { audioBase64, meetingAudioStore, meetingRecordingApi, type LocalMeetingAudio } from '@/lib/meeting-recording'
import { mixWindowsMeetingPlayback } from '@/lib/meeting-playback'
import { getApiUrl } from '@/lib/gateway-url'

interface NativeState { phase: 'idle' | 'recording' | 'ready' | 'failed'; startedAt?: number; id?: string; size?: number }
const AndroidMeeting = registerPlugin<{
  start: (options: { id: string; owner: string }) => Promise<void>
  stop: (options: { owner: string }) => Promise<void>
  state: (options: { owner: string }) => Promise<NativeState>
  read: (options: { offset: number; length: number; owner: string }) => Promise<{ audio: string }>
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

  useEffect(() => {
    previousNativeState.current = 'idle'
    setSetup(undefined); setJob(null); setPending(undefined); setPhase('idle'); setError('')
    if (!owner) return
    let ignore = false
    void meetingRecordingApi.settings().then(result => { if (!ignore) setSetup(result) }).catch(() => {})
    void meetingRecordingApi.latest().then(result => { if (!ignore) setJob(result) }).catch(() => {})
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
      if (current.stage === 'uploading') current = await meetingRecordingApi.submit(audio.id)
      if (liveOwner.current !== owner) return
      setJob(current); setPending(undefined)
      await audio.cleanup().catch(() => {})
    } catch (failure) {
      if (liveOwner.current === owner) setError(String((failure as Error).message ?? failure))
    } finally {
      operation.current = false
      if (liveOwner.current === owner) setPhase('idle')
    }
  }, [owner])

  useEffect(() => {
    if (!native || !owner || (!setup?.configured && previousNativeState.current === 'idle')) return
    let ignore = false
    const sync = async () => {
      const state = await AndroidMeeting.state({ owner })
      if (ignore || liveOwner.current !== owner) return
      const previous = previousNativeState.current
      previousNativeState.current = state.phase
      if (state.phase === 'recording') {
        setStarted(state.startedAt ?? Date.now()); setPhase('recording')
      } else if (state.phase === 'failed' && previous !== 'failed') {
        setPhase('idle'); setError('Android could not record from the microphone.')
      } else if (state.phase === 'ready' && previous !== 'ready' && state.id && state.startedAt && state.size) {
        const size = state.size
        const audio = { id: state.id, startedAt: new Date(state.startedAt).toISOString(), size, mimeType: 'audio/mp4',
          read: async (offset: number) => (await AndroidMeeting.read({ offset, length: Math.min(MEETING_UPLOAD_CHUNK, size - offset), owner })).audio,
          cleanup: () => AndroidMeeting.discard({ owner }),
        }
        setPending(audio)
        if (previous === 'recording') void upload(audio)
        else setPhase('idle')
      }
    }
    const tick = () => { void sync().catch(() => {}) }
    tick()
    const interval = window.setInterval(tick, 750)
    return () => { ignore = true; window.clearInterval(interval) }
  }, [native, owner, setup?.configured, upload])

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
    setError(''); setPhase('starting'); setSeconds(0)
    const id = crypto.randomUUID()
    const startedAt = new Date().toISOString()
    let stream: MediaStream | undefined
    let releasePlayback: (() => void) | undefined
    let playbackInterrupted = false
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
      const capture = new MediaRecorder(mixed.stream, { mimeType, audioBitsPerSecond: 64_000 })
      const chunks: Blob[] = []
      let bytes = 0
      const release = () => { recorder.current = null; releasePlayback?.(); stream?.getTracks().forEach(track => track.stop()) }
      capture.ondataavailable = event => {
        if (!event.data.size) return
        chunks.push(event.data); bytes += event.data.size
        if (bytes >= MEETING_MAX_BYTES - MEETING_UPLOAD_CHUNK && capture.state === 'recording') capture.stop()
      }
      capture.onerror = () => { release(); setPhase('idle'); setError('The device stopped recording audio.') }
      capture.onstop = () => {
        release()
        if (liveOwner.current !== owner) return
        setPhase('idle')
        if (!bytes || bytes > MEETING_MAX_BYTES) { setError('No usable audio was captured.'); return }
        const recording = { id, startedAt, audio: new Blob(chunks, { type: capture.mimeType || mimeType || 'audio/webm' }) }
        const audio = storeAudio(recording)
        setPending(audio)
        void meetingAudioStore(owner, 'write', recording).catch(() => {}).then(() => {
          if (liveOwner.current !== owner) return
          if (playbackInterrupted) setError('System audio was interrupted. You can upload the partial recording or discard it.')
          else void upload(audio)
        })
      }
      recorder.current = capture
      capture.start(1000); setStarted(Date.now()); setPhase('recording')
    } catch (failure) {
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
      if (job && ['uploading', 'failed'].includes(job.stage)) await meetingRecordingApi.discard(job.id)
      await pending?.cleanup()
      setPending(undefined); setJob(null); setError(''); setPhase('idle')
    } catch (failure) { setError(String((failure as Error).message ?? failure)) }
    finally { operation.current = false }
  }

  const openNativeNote = native ? (url: string) => AndroidMeeting.openNote({ url }) : window.jaitDesktop?.openMeetingNote

  return { setup, setSetup, job, phase, seconds, pending: !!pending, error, start, stop, retry, discard, openNativeNote, nativeApp: platform !== 'web' }
}

export const MeetingRecordingContext = createContext<ReturnType<typeof useMeetingRecording> | null>(null)
