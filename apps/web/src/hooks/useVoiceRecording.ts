import { useCallback, useEffect, useRef, useState } from 'react'
import type { SttProvider } from '@/hooks/useAuth'
import { getApiUrl } from '@/lib/gateway-url'
import {
  VOICE_LEVEL_BAR_COUNT,
  VOICE_LEVEL_FLOOR,
  createSilentVoiceLevels,
} from '@/lib/voice-levels'
import { appendTranscript, normalizeTranscript } from '@/lib/transcript-merge'

const API_URL = getApiUrl()

export type VoiceInputOptions = {
  onTranscript?: (text: string) => void
}

export interface UseVoiceRecordingOptions {
  /** Auth token; recording is blocked (and `onAuthRequired` fired) when missing. */
  token: string | null
  /** Active chat session id, used to scope server-side transcription. */
  activeSessionId: string | null
  /** Configured speech-to-text provider. */
  sttProvider: SttProvider
  /** Applies the final transcript to the chat input when no per-call target is set. */
  setInputValue: (valOrFn: string | ((prev: string) => string)) => void
  /** Invoked when recording is attempted without a valid auth token. */
  onAuthRequired: () => void
}

export interface UseVoiceRecordingResult {
  voiceRecording: boolean
  voiceTranscribing: boolean
  voiceLevels: number[]
  handleVoiceInput: (options?: VoiceInputOptions) => Promise<void>
  stopRecordingAndTranscribe: () => Promise<void>
}

/**
 * Push-to-talk voice recording: captures mic audio with MediaRecorder, renders a
 * live level visualizer, and transcribes the result through the gateway STT endpoint.
 */
export function useVoiceRecording({
  token,
  activeSessionId,
  sttProvider,
  setInputValue,
  onAuthRequired,
}: UseVoiceRecordingOptions): UseVoiceRecordingResult {
  const [voiceRecording, setVoiceRecording] = useState(false)
  const [voiceTranscribing, setVoiceTranscribing] = useState(false)
  const [voiceLevels, setVoiceLevels] = useState<number[]>(() => createSilentVoiceLevels())
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioStreamRef = useRef<MediaStream | null>(null)
  const voiceLevelsRef = useRef<number[]>(createSilentVoiceLevels())
  const voiceAudioContextRef = useRef<AudioContext | null>(null)
  const voiceAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const voiceAnalyserRef = useRef<AnalyserNode | null>(null)
  const voiceLevelDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const voiceLevelFrameRef = useRef<number | null>(null)
  const voiceTranscriptTargetRef = useRef<((text: string) => void) | null>(null)

  const applyVoiceTranscript = useCallback((transcript: string) => {
    const normalizedTranscript = normalizeTranscript(transcript)
    if (!normalizedTranscript) return

    const target = voiceTranscriptTargetRef.current
    if (target) {
      target(normalizedTranscript)
      return
    }

    setInputValue((prev) => appendTranscript(prev, normalizedTranscript))
  }, [setInputValue])

  const resetVoiceLevels = useCallback(() => {
    const silent = createSilentVoiceLevels()
    voiceLevelsRef.current = silent
    setVoiceLevels(silent)
  }, [])

  const stopVoiceVisualizer = useCallback(() => {
    if (voiceLevelFrameRef.current !== null) {
      cancelAnimationFrame(voiceLevelFrameRef.current)
      voiceLevelFrameRef.current = null
    }
    voiceAudioSourceRef.current?.disconnect()
    voiceAudioSourceRef.current = null
    voiceAnalyserRef.current = null
    voiceLevelDataRef.current = null

    const audioContext = voiceAudioContextRef.current
    voiceAudioContextRef.current = null
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch(() => {})
    }

    resetVoiceLevels()
  }, [resetVoiceLevels])

  const startVoiceVisualizer = useCallback((stream: MediaStream) => {
    stopVoiceVisualizer()

    try {
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.58

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      const data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
      voiceAudioContextRef.current = audioContext
      voiceAudioSourceRef.current = source
      voiceAnalyserRef.current = analyser
      voiceLevelDataRef.current = data

      const tick = () => {
        const analyserNode = voiceAnalyserRef.current
        const samples = voiceLevelDataRef.current
        if (!analyserNode || !samples) return

        analyserNode.getByteTimeDomainData(samples)
        let total = 0
        for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
          total += Math.abs((samples[sampleIndex] - 128) / 128)
        }
        const average = samples.length > 0 ? total / samples.length : 0
        const boostedLevel = Math.pow(Math.min(1, average * 6.8), 0.78)
        const targetLevel = Math.min(1, Math.max(VOICE_LEVEL_FLOOR, boostedLevel))
        const previousTail = voiceLevelsRef.current[voiceLevelsRef.current.length - 1] ?? VOICE_LEVEL_FLOOR
        const nextLevel = previousTail * 0.2 + targetLevel * 0.8
        const timeline = [
          ...voiceLevelsRef.current.slice(-(VOICE_LEVEL_BAR_COUNT - 1)),
          nextLevel,
        ]

        voiceLevelsRef.current = timeline
        setVoiceLevels(timeline)
        voiceLevelFrameRef.current = requestAnimationFrame(tick)
      }

      tick()
    } catch (error) {
      console.warn('Voice visualizer unavailable:', error)
      resetVoiceLevels()
    }
  }, [resetVoiceLevels, stopVoiceVisualizer])

  /** Encode PCM samples from an AudioBuffer into a WAV Blob (16-bit, 16 kHz mono). */
  const buildWavBlob = useCallback((audioBuffer: AudioBuffer): Blob => {
    const numChannels = 1
    const sampleRate = audioBuffer.sampleRate
    const samples = audioBuffer.getChannelData(0)
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)

    const writeStr = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
    }
    writeStr(0, 'RIFF')
    view.setUint32(4, 36 + samples.length * 2, true)
    writeStr(8, 'WAVE')
    writeStr(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true) // PCM
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * numChannels * 2, true)
    view.setUint16(32, numChannels * 2, true)
    view.setUint16(34, 16, true) // bits per sample
    writeStr(36, 'data')
    view.setUint32(40, samples.length * 2, true)

    let offset = 44
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
      offset += 2
    }
    return new Blob([buffer], { type: 'audio/wav' })
  }, [])

  const stopRecordingAndTranscribe = useCallback(async () => {
    setVoiceRecording(false)
    stopVoiceVisualizer()

    // Stop MediaRecorder and collect audio
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      audioStreamRef.current?.getTracks().forEach((t) => t.stop())
      audioStreamRef.current = null
      mediaRecorderRef.current = null
      voiceTranscriptTargetRef.current = null
      return
    }

    const audioBlob = await new Promise<Blob>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        resolve(new Blob(audioChunksRef.current, { type: recorder.mimeType }))
      }
      const timeout = window.setTimeout(finish, 1500)
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = finish
      recorder.onerror = finish
      try {
        recorder.requestData()
      } catch {
        // Some browsers throw if the recorder is already stopping.
      }
      try {
        recorder.stop()
      } catch {
        finish()
      }
    })

    // Stop mic
    audioStreamRef.current?.getTracks().forEach((t) => t.stop())
    audioStreamRef.current = null
    mediaRecorderRef.current = null

    if (audioBlob.size === 0) {
      voiceTranscriptTargetRef.current = null
      return
    }

    if (sttProvider === 'wyoming' || sttProvider === 'whisper' || sttProvider === 'gpt' || sttProvider === 'elevenlabs') {
      // Convert to WAV and send to backend
      setVoiceTranscribing(true)
      try {
        // Decode the webm blob to raw PCM, then re-encode as WAV
        const arrayBuf = await audioBlob.arrayBuffer()
        const audioCtx = new AudioContext({ sampleRate: 16000 })
        const decoded = await audioCtx.decodeAudioData(arrayBuf)
        const wavBlob = buildWavBlob(decoded)
        await audioCtx.close()

        // Convert to base64
        const wavArrayBuf = await wavBlob.arrayBuffer()
        const bytes = new Uint8Array(wavArrayBuf)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        const audioBase64 = btoa(binary)

        const res = await fetch(`${API_URL}/api/voice/transcribe-audio`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            audioBase64,
            sessionId: activeSessionId ?? 'voice-input',
            provider: sttProvider,
          }),
        })
        const data = (await res.json()) as { text?: string; error?: string; details?: string }
        if (data.text) {
          applyVoiceTranscript(data.text)
        } else {
          console.warn('Transcription failed:', data.details ?? data.error)
        }
      } catch (err) {
        console.error('Transcription error:', err)
      } finally {
        setVoiceTranscribing(false)
        voiceTranscriptTargetRef.current = null
      }
    } else {
      voiceTranscriptTargetRef.current = null
    }
  }, [activeSessionId, applyVoiceTranscript, buildWavBlob, sttProvider, stopVoiceVisualizer, token])

  const handleVoiceInput = useCallback(async (options?: VoiceInputOptions) => {
    voiceTranscriptTargetRef.current = options?.onTranscript ?? null
    if (!token) {
      voiceTranscriptTargetRef.current = null
      onAuthRequired()
      return
    }

    // Whisper / Wyoming provider: push-to-talk with MediaRecorder
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      })
      audioStreamRef.current = stream
      audioChunksRef.current = []
      startVoiceVisualizer(stream)

      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.start()
      setVoiceRecording(true)
    } catch (err) {
      voiceTranscriptTargetRef.current = null
      stopVoiceVisualizer()
      console.error('Microphone access failed:', err)

      // `navigator.mediaDevices` is undefined on insecure (plain http) origins,
      // e.g. a Capacitor Android WebView serving the app with `androidScheme: http`
      // — that failure is a secure-context issue, not an OS permission problem.
      let message = 'Microphone access is required for push-to-talk.'
      if (!navigator.mediaDevices) {
        message = 'Microphone is unavailable: the app is not running in a secure (https) context.'
      } else if (
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
      ) {
        message = 'Microphone permission was denied. Allow microphone access for push-to-talk.'
      } else if (
        err instanceof DOMException &&
        (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')
      ) {
        message = 'No microphone was found on this device.'
      }
      window.alert(message)
    }
  }, [onAuthRequired, startVoiceVisualizer, stopVoiceVisualizer, token])

  useEffect(() => {
    return () => {
      stopVoiceVisualizer()
      audioStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [stopVoiceVisualizer])

  return {
    voiceRecording,
    voiceTranscribing,
    voiceLevels,
    handleVoiceInput,
    stopRecordingAndTranscribe,
  }
}
