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
  const buf = new ArrayBuffer(float32.length * 2)
  const view = new DataView(buf)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buf
}

function pcm16ToFloat32(pcm16: ArrayBuffer): Float32Array {
  const view = new DataView(pcm16)
  const float32 = new Float32Array(pcm16.byteLength / 2)
  for (let i = 0; i < float32.length; i++) {
    float32[i] = view.getInt16(i * 2, true) / 0x8000
  }
  return float32
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// ── Tool sound effect ───────────────────────────────────────────

/** Short ascending two-tone blip when a tool starts executing. */
function playToolSound() {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)

    // First tone
    const osc1 = ctx.createOscillator()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(880, now)
    osc1.connect(gain)
    osc1.start(now)
    osc1.stop(now + 0.1)

    // Second tone (higher, slight delay)
    const osc2 = ctx.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1320, now + 0.08)
    osc2.connect(gain)
    osc2.start(now + 0.08)
    osc2.stop(now + 0.2)

    // Cleanup
    osc2.onended = () => void ctx.close().catch(() => {})
  } catch {}
}

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

  // Audio playback
  const playbackContextRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef(0)

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

  // ── Stop audio capture ──────────────────────────────────────
  const stopCapture = useCallback(() => {
    processorRef.current?.disconnect()
    processorRef.current = null
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
            setState(prev => ({ ...prev, assistantSpeaking: true }))
            break

          case 'audio.done':
            setState(prev => ({ ...prev, assistantSpeaking: false }))
            break

          case 'audio.interrupt':
            // User interrupted — flush all queued audio immediately
            if (playbackContextRef.current && playbackContextRef.current.state !== 'closed') {
              void playbackContextRef.current.close().catch(() => {})
            }
            playbackContextRef.current = null
            nextPlayTimeRef.current = 0
            setState(prev => ({ ...prev, assistantSpeaking: false }))
            break

          case 'transcript':
            if (msg.role === 'user') {
              setState(prev => ({ ...prev, userTranscript: msg.text }))
            } else {
              setState(prev => ({ ...prev, assistantTranscript: msg.final ? msg.text : prev.assistantTranscript + msg.text }))
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
            if (msg.status === 'running') playToolSound()
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
      // ScriptProcessor: deprecated but universally supported and simple
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
      processor.connect(audioCtx.destination) // must connect to destination for onaudioprocess to fire

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
  }
}
