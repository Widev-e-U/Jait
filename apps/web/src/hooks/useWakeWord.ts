import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import { getApiUrl } from '@/lib/gateway-url'
import { matchWakeTranscript } from '@/lib/wake-word'

export interface UseWakeWordOptions {
  enabled: boolean
  token: string | null
  lang?: string
  wakePhrases?: string[]
  /** Starts one session, including any words spoken after the wake phrase. */
  onActivate: (command: string) => void
}

export interface UseWakeWordReturn {
  isRunning: boolean
  /** Waiting for a sentence after a wake phrase spoken on its own. */
  isListening: boolean
  isChecking: boolean
  isSupported: boolean
  interimTranscript: string
  error: string | null
}

// The browser provides SpeechRecognition in Chromium but not in every browser.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionInstance = any

export function useWakeWord({ enabled, token, lang, wakePhrases, onActivate }: UseWakeWordOptions): UseWakeWordReturn {
  const [isRunning, setIsRunning] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const onActivateRef = useRef(onActivate)
  onActivateRef.current = onActivate
  const phrasesRef = useRef(wakePhrases)
  phrasesRef.current = wakePhrases
  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  useEffect(() => {
    if (!enabled || !isSupported) {
      setIsRunning(false)
      setIsListening(false)
      setIsChecking(false)
      setInterimTranscript('')
      return
    }

    const SpeechRecognitionCtor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    const recognition: SpeechRecognitionInstance = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.lang = lang ?? navigator.language ?? 'en-US'

    let disposed = false
    let activated = false
    let blocked = false
    let restartTimer: ReturnType<typeof setTimeout> | undefined
    let followupTimer: ReturnType<typeof setTimeout> | undefined
    let awaitingFollowup = false
    let pending: AbortController | undefined
    setError(null)

    const activate = (command: string) => {
      if (disposed || activated) return
      activated = true
      pending?.abort()
      if (followupTimer) clearTimeout(followupTimer)
      recognition.abort()
      setIsRunning(false)
      setIsListening(false)
      setIsChecking(false)
      setInterimTranscript('')
      onActivateRef.current(command)
    }

    const waitForFollowup = () => {
      awaitingFollowup = true
      setIsListening(true)
      setIsChecking(false)
      followupTimer = setTimeout(() => activate(''), 2200)
    }
    const begin = (command: string) => command ? activate(command) : waitForFollowup()

    recognition.onstart = () => { if (!disposed) { setIsRunning(true); setError(null) } }
    recognition.onresult = (event: any) => {
      if (disposed || activated) return
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0]?.transcript?.trim() ?? ''
        const match = matchWakeTranscript(transcript, phrasesRef.current)
        if (awaitingFollowup) {
          if (!transcript) continue
          if (followupTimer) clearTimeout(followupTimer)
          if (result.isFinal) {
            const command = match.kind === 'direct' ? match.command : transcript
            if (command) { activate(command); return }
            followupTimer = setTimeout(() => activate(''), 2200)
          } else {
            setInterimTranscript(transcript)
            // Let the speaker finish a sentence once speech has begun.
            followupTimer = setTimeout(() => activate(''), 7000)
          }
          continue
        }
        if (!result.isFinal) {
          setInterimTranscript(match.kind === 'none' ? '' : transcript)
          continue
        }
        setInterimTranscript('')
        if (match.kind === 'direct') {
          pending?.abort()
          pending = undefined
          setIsChecking(false)
          begin(match.command)
          if (activated) return
          continue
        }
        if (match.kind !== 'ambiguous' || !token || pending || transcript.length > 1000) continue
        const controller = new AbortController()
        pending = controller
        setIsChecking(true)
        const timeout = setTimeout(() => controller.abort(), 2500)
        void apiFetch(`${getApiUrl()}/api/voice/wake-candidate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ transcript }),
          signal: controller.signal,
        }).then(async response => response.ok ? response.json() as Promise<{ activate?: boolean }> : null)
          .then(result => { if (result?.activate && !controller.signal.aborted) begin(match.command) })
          .catch(() => {})
          .finally(() => {
            clearTimeout(timeout)
            if (pending === controller) pending = undefined
            if (!disposed && !activated) setIsChecking(false)
          })
      }
    }
    recognition.onerror = (event: any) => {
      if (disposed) return
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        blocked = true
        if (followupTimer) clearTimeout(followupTimer)
        setIsListening(false)
        setIsRunning(false)
        setError('Microphone or speech recognition permission is blocked')
      } else if (event.error === 'audio-capture') {
        blocked = true
        if (followupTimer) clearTimeout(followupTimer)
        setIsListening(false)
        setIsRunning(false)
        setError('No microphone is available')
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError('Speech recognition is unavailable; retrying')
      }
    }
    recognition.onend = () => {
      if (disposed) return
      setIsRunning(false)
      if (!blocked && !activated) {
        restartTimer = setTimeout(() => {
          if (disposed || blocked || activated) return
          try { recognition.start() } catch { setError('Speech recognition could not start') }
        }, 300)
      }
    }
    try { recognition.start() } catch { setError('Speech recognition could not start') }

    return () => {
      disposed = true
      pending?.abort()
      if (restartTimer) clearTimeout(restartTimer)
      if (followupTimer) clearTimeout(followupTimer)
      recognition.abort()
    }
  }, [enabled, isSupported, lang, token])

  return { isRunning, isListening, isChecking, isSupported, interimTranscript, error }
}
