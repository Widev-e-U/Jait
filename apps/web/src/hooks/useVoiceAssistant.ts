import { useState, useRef, useCallback, useEffect } from 'react'
import type { VoiceAssistantState, VoiceServerMessage } from '@jait/shared'
import { VOICE_ASSISTANT_INITIAL_STATE } from '@jait/shared'

/** PCM16 sample rate for OpenAI Realtime API (both input and output). */
const SAMPLE_RATE = 24000

const API_URL = (() => {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined
  if (envUrl) return envUrl.replace(/\/+$/, '')
  return `${window.location.protocol}//${window.location.hostname}:${window.location.port}`
})()

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const envUrl = import.meta.env.VITE_API_URL as string | undefined
  if (envUrl) {
    const u = new URL(envUrl)
    return `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`
  }
  return `${proto}//${window.location.host}`
}

// ── Audio helpers ───────────────────────────────────────────────

function float32ToPcm16(float32: Float32Array): ArrayBuffer {
  const pcm16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return pcm16.buffer
}

function pcm16ToFloat32(pcm16: ArrayBuffer): Float32Array {
  const int16 = new Int16Array(pcm16)
  const float32 = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 0x8000
  }
  return float32
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const CHUNK = 0x8000
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]))
  }
  return btoa(parts.join(''))
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// ── AudioWorklet for off-main-thread mic capture ────────────────

const WORKLET_CODE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(4096);
    this._off = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    let srcOff = 0;
    while (srcOff < input.length) {
      const space = this._buf.length - this._off;
      const n = Math.min(input.length - srcOff, space);
      this._buf.set(input.subarray(srcOff, srcOff + n), this._off);
      this._off += n;
      srcOff += n;
      if (this._off >= this._buf.length) {
        const pcm16 = new Int16Array(this._buf.length);
        for (let i = 0; i < this._buf.length; i++) {
          const s = Math.max(-1, Math.min(1, this._buf[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
        this._off = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCaptureProcessor);
`

let _workletBlobUrl: string | null = null
function getWorkletUrl(): string {
  if (!_workletBlobUrl) {
    _workletBlobUrl = URL.createObjectURL(
      new Blob([WORKLET_CODE], { type: 'application/javascript' }),
    )
  }
  return _workletBlobUrl
}

// ── Tool sound effect ───────────────────────────────────────────

/** Short ascending two-tone blip when a tool starts executing. */
// ── Hook ────────────────────────────────────────────────────────

export interface UseVoiceAssistantOptions {
  authToken: string | null
  onStatusChange?: (status: VoiceAssistantState['status']) => void
  onError?: (error: string) => void
  onConnected?: () => void
  onDisconnected?: () => void
}

export interface UseVoiceAssistantReturn extends VoiceAssistantState {
  connect: () => Promise<void>
  disconnect: () => void
  toggleMic: () => void
  announce: (text: string) => void
}

export function useVoiceAssistant(options: UseVoiceAssistantOptions): UseVoiceAssistantReturn {
  const { authToken, onStatusChange, onError, onConnected, onDisconnected } = options

  const [state, setState] = useState<VoiceAssistantState>(VOICE_ASSISTANT_INITIAL_STATE)

  const wsRef = useRef<WebSocket | null>(null)
  const connectingRef = useRef(false)

  // Audio capture
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)

  // Audio playback
  const playbackContextRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef(0)

  // Client-side speech detection for instant interruption
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rawMicStreamRef = useRef<MediaStream | null>(null) // separate non-echo-cancelled stream
  const rawMicCtxRef = useRef<AudioContext | null>(null)
  const speechDetectRafRef = useRef(0)

  // Transcript batching — accumulate tokens and flush once per frame
  const transcriptBufferRef = useRef('')
  const transcriptRafRef = useRef(0)

  // Stable callback refs
  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const onConnectedRef = useRef(onConnected)
  onConnectedRef.current = onConnected
  const onDisconnectedRef = useRef(onDisconnected)
  onDisconnectedRef.current = onDisconnected

  const updateStatus = useCallback((status: VoiceAssistantState['status']) => {
    setState(prev => ({ ...prev, status }))
    onStatusChangeRef.current?.(status)
  }, [])

  const sendInterrupt = useCallback(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    try {
      ws.send(JSON.stringify({ type: 'interrupt' }))
    } catch {}
  }, [])

  const announce = useCallback((text: string) => {
    const normalized = text.trim()
    const ws = wsRef.current
    if (!normalized || !ws || ws.readyState !== WebSocket.OPEN) return
    try {
      ws.send(JSON.stringify({ type: 'announce', text: normalized }))
    } catch {}
  }, [])

  // ── Instant local playback cutoff (no server round-trip) ───
  const cutPlaybackNow = useCallback(() => {
    const ctx = playbackContextRef.current
    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => {})
    }
    playbackContextRef.current = null
    nextPlayTimeRef.current = 0
  }, [])

  // ── Stop audio capture ──────────────────────────────────────
  const stopCapture = useCallback(() => {
    cancelAnimationFrame(speechDetectRafRef.current)
    speechDetectRafRef.current = 0
    analyserRef.current = null
    // Clean up raw mic stream used for speech detection
    rawMicStreamRef.current?.getTracks().forEach(t => t.stop())
    rawMicStreamRef.current = null
    const rawCtx = rawMicCtxRef.current
    rawMicCtxRef.current = null
    if (rawCtx && rawCtx.state !== 'closed') void rawCtx.close().catch(() => {})
    processorRef.current?.disconnect()
    processorRef.current = null
    workletNodeRef.current?.disconnect()
    workletNodeRef.current = null
    mediaStreamRef.current?.getTracks().forEach(t => t.stop())
    mediaStreamRef.current = null
    const ctx = audioContextRef.current
    audioContextRef.current = null
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {})
  }, [])

  // ── Stop audio playback ─────────────────────────────────────
  const stopPlayback = useCallback(() => {
    const ctx = playbackContextRef.current
    playbackContextRef.current = null
    nextPlayTimeRef.current = 0
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {})
  }, [])

  // ── Disconnect ──────────────────────────────────────────────
  const disconnect = useCallback(() => {
    const ws = wsRef.current
    if (ws) {
      try { ws.send(JSON.stringify({ type: 'stop' })) } catch {}
      ws.close()
      wsRef.current = null
    }
    stopCapture()
    stopPlayback()
    setState(VOICE_ASSISTANT_INITIAL_STATE)
    onDisconnectedRef.current?.()
  }, [stopCapture, stopPlayback])

  // ── Play received PCM16 audio ───────────────────────────────
  const playAudioChunk = useCallback((base64: string) => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE })
    }
    const ctx = playbackContextRef.current
    const pcm16 = base64ToArrayBuffer(base64)
    const float32 = pcm16ToFloat32(pcm16)

    const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE)
    buffer.getChannelData(0).set(float32)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)

    const now = ctx.currentTime
    if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now
    source.start(nextPlayTimeRef.current)
    nextPlayTimeRef.current += buffer.duration
  }, [])

  // ── Connect ─────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!authToken || connectingRef.current) return
    if (wsRef.current) disconnect()

    connectingRef.current = true
    updateStatus('connecting')

    try {
      // 1. Check availability
      let statusData: { available?: boolean } = { available: false }
      try {
        const statusRes = await fetch(`${API_URL}/api/voice-assistant/status`)
        if (!statusRes.ok) throw new Error(`Server returned ${statusRes.status}`)
        statusData = await statusRes.json() as { available?: boolean }
      } catch (fetchErr) {
        throw new Error('Cannot reach Jait gateway — is the server running?')
      }
      if (!statusData.available) {
        throw new Error('Voice assistant not available — check your OPENAI_API_KEY in the gateway .env')
      }

      // 2. Open WebSocket
      const ws = new WebSocket(`${wsUrl()}/ws/voice-assistant?token=${encodeURIComponent(authToken)}`)
      wsRef.current = ws

      ws.onmessage = (event) => {
        let msg: VoiceServerMessage
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }

        switch (msg.type) {
          case 'session.started':
            updateStatus('connected')
            onConnectedRef.current?.()
            break

          case 'audio':
            playAudioChunk(msg.data)
            // Only setState when transitioning to speaking — skip if already speaking
            setState(prev => prev.assistantSpeaking ? prev : { ...prev, assistantSpeaking: true })
            break

          case 'audio.done':
            setState(prev => prev.assistantSpeaking ? { ...prev, assistantSpeaking: false } : prev)
            break

          case 'audio.interrupt':
            // Server confirmed interruption — ensure playback is dead
            cutPlaybackNow()
            setState(prev => prev.assistantSpeaking ? { ...prev, assistantSpeaking: false } : prev)
            break

          case 'transcript':
            if (msg.role === 'user') {
              setState(prev => prev.userTranscript === msg.text ? prev : { ...prev, userTranscript: msg.text })
            } else {
              // Batch rapid transcript tokens — accumulate in ref + flush via rAF
              transcriptBufferRef.current += (msg.final ? msg.text : msg.text)
              if (msg.final) transcriptBufferRef.current = msg.text
              if (!transcriptRafRef.current) {
                transcriptRafRef.current = requestAnimationFrame(() => {
                  const buffered = transcriptBufferRef.current
                  transcriptRafRef.current = 0
                  setState(prev => {
                    const next = msg.final ? buffered : prev.assistantTranscript + buffered
                    transcriptBufferRef.current = ''
                    return next === prev.assistantTranscript ? prev : { ...prev, assistantTranscript: next }
                  })
                })
              }
            }
            break

          case 'status':
            updateStatus(msg.status)
            break

          case 'error':
            setState(prev => ({ ...prev, status: 'error', error: msg.message }))
            onErrorRef.current?.(msg.message)
            break

          case 'tool_call':
            console.debug(`[voice] tool ${msg.name}: ${msg.status}`, msg.status === 'completed' ? msg.result?.slice(0, 100) : '')
            break
        }
      }

      ws.onerror = () => {
        onErrorRef.current?.('WebSocket connection failed')
      }

      ws.onclose = () => {
        stopCapture()
        stopPlayback()
        // Don't overwrite error state — only reset if we weren't already in error
        setState(prev => prev.status === 'error' ? prev : VOICE_ASSISTANT_INITIAL_STATE)
        wsRef.current = null
        onDisconnectedRef.current?.()
      }

      // Wait for WS to open (with timeout)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timed out — is the gateway running?'))
        }, 8000)
        ws.onopen = () => { clearTimeout(timeout); resolve() }
        const origError = ws.onerror
        ws.onerror = (e) => {
          clearTimeout(timeout)
          origError?.call(ws, e)
          reject(new Error('WebSocket connection failed'))
        }
      })

      // 3. Start mic capture
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: SAMPLE_RATE },
      })
      mediaStreamRef.current = stream

      const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE })
      audioContextRef.current = audioCtx

      const source = audioCtx.createMediaStreamSource(stream)

      // Set up a SEPARATE raw mic stream (no echo cancellation) for speech detection.
      // The echo-cancelled stream can't detect the user's voice while the assistant
      // is playing through speakers — the canceller suppresses it.
      try {
        const rawStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
        })
        rawMicStreamRef.current = rawStream
        const rawCtx = new AudioContext()
        rawMicCtxRef.current = rawCtx
        const rawSource = rawCtx.createMediaStreamSource(rawStream)
        const analyser = rawCtx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.2
        rawSource.connect(analyser)
        analyserRef.current = analyser
      } catch {
        // If we can't get a second stream, fall back to the echo-cancelled one
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.2
        source.connect(analyser)
        analyserRef.current = analyser
      }

      // Prefer AudioWorklet (processes audio off the main thread)
      // Fall back to ScriptProcessor if AudioWorklet isn't available
      try {
        await audioCtx.audioWorklet.addModule(getWorkletUrl())
        const workletNode = new AudioWorkletNode(audioCtx, 'pcm-capture')
        workletNodeRef.current = workletNode
        workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
          if (wsRef.current?.readyState !== WebSocket.OPEN) return
          const base64 = arrayBufferToBase64(e.data)
          wsRef.current.send(JSON.stringify({ type: 'audio', data: base64 }))
        }
        source.connect(workletNode)
      } catch {
        // Fallback: ScriptProcessor (runs on main thread, deprecated but universal)
        const processor = audioCtx.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor
        processor.onaudioprocess = (e) => {
          if (wsRef.current?.readyState !== WebSocket.OPEN) return
          const float32 = e.inputBuffer.getChannelData(0)
          const pcm16 = float32ToPcm16(float32)
          const base64 = arrayBufferToBase64(pcm16)
          wsRef.current.send(JSON.stringify({ type: 'audio', data: base64 }))
        }
        source.connect(processor)
        processor.connect(audioCtx.destination)
      }

      setState(prev => ({ ...prev, status: 'listening', micActive: true }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Clean up any partial resources without triggering onDisconnected
      stopCapture()
      stopPlayback()
      const ws = wsRef.current
      if (ws) { try { ws.close() } catch {} wsRef.current = null }
      setState({ ...VOICE_ASSISTANT_INITIAL_STATE, status: 'error', error: message })
      onErrorRef.current?.(message)
    } finally {
      connectingRef.current = false
    }
  }, [authToken, disconnect, playAudioChunk, stopCapture, stopPlayback, updateStatus])

  // ── Toggle mic ──────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    const stream = mediaStreamRef.current
    if (!stream) return
    const track = stream.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setState(prev => ({ ...prev, micActive: track.enabled }))
  }, [])

  // ── Client-side speech detection for instant interruption ───
  // While the assistant is speaking, poll the mic's AnalyserNode.
  // If the user talks loudly enough, kill playback instantly
  // (don't wait for the server VAD round-trip).
  useEffect(() => {
    if (!state.assistantSpeaking || !state.micActive) return
    const analyser = analyserRef.current
    if (!analyser) return

    const buf = new Uint8Array(analyser.frequencyBinCount)
    let consecutiveFrames = 0
    const THRESHOLD = 20   // RMS amplitude 0-128; lower since raw mic has no echo cancellation
    const FRAMES_NEEDED = 2 // ~33ms at 60fps — fast reaction

    const detect = () => {
      analyser.getByteTimeDomainData(buf)
      // Compute RMS of waveform (centered at 128)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i] - 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / buf.length)

      if (rms > THRESHOLD) {
        consecutiveFrames++
        if (consecutiveFrames >= FRAMES_NEEDED) {
          // User is speaking — kill playback immediately
          cutPlaybackNow()
          sendInterrupt()
          setState(prev => prev.assistantSpeaking ? { ...prev, assistantSpeaking: false } : prev)
          return // stop the loop
        }
      } else {
        consecutiveFrames = 0
      }
      speechDetectRafRef.current = requestAnimationFrame(detect)
    }
    speechDetectRafRef.current = requestAnimationFrame(detect)
    return () => {
      cancelAnimationFrame(speechDetectRafRef.current)
      speechDetectRafRef.current = 0
    }
  }, [state.assistantSpeaking, state.micActive, cutPlaybackNow, sendInterrupt])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close()
      wsRef.current = null
      stopCapture()
      stopPlayback()
    }
  }, [stopCapture, stopPlayback])

  return {
    ...state,
    connect,
    disconnect,
    toggleMic,
    announce,
  }
}
