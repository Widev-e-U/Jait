import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Continuous wake-word listener using the Web Speech API (SpeechRecognition).
 *
 * Works in Chromium-based browsers (Chrome, Edge, Electron) which provide
 * `webkitSpeechRecognition`. The recogniser runs continuously in the background
 * with almost no CPU cost because the browser's built-in speech engine handles
 * all audio processing natively.
 *
 * Flow:
 *  1. When `enabled`, starts a continuous SpeechRecognition instance.
 *  2. Every interim/final result is checked for the wake phrase (default "jait").
 *  3. On detection the wake word is stripped and the remaining command text
 *     (if any) is passed to `onCommand`.
 *  4. If the user said *only* the wake word, the hook enters "listening" mode
 *     and the *next* final result is forwarded as the command.
 *  5. After delivering a command, the hook goes back to passive wake-word
 *     monitoring.
 */

export interface UseWakeWordOptions {
  /** Whether the always-on listener is active. */
  enabled: boolean
  /** Language / locale for speech recognition (default: navigator language). */
  lang?: string
  /**
   * Custom wake phrases — any match activates. Default includes "jait" plus
   * common misrecognitions by Google's speech engine (jade, jayit, gate, etc.).
   */
  wakePhrases?: string[]
  /** Called with the command text once a wake-word activation + command is captured. */
  onCommand: (text: string) => void
  /** Called when the wake word is detected (e.g. to play a chime / show UI). */
  onWakeWordDetected?: () => void
  /** Called when listening times out without a follow-up command. */
  onListeningTimeout?: () => void
}

export interface UseWakeWordReturn {
  /** Whether the SpeechRecognition engine is currently running. */
  isRunning: boolean
  /** Whether the hook is actively listening for a command (post-wake-word). */
  isListening: boolean
  /** Whether the browser supports the Web Speech API. */
  isSupported: boolean
  /** Last interim transcript (for UI feedback). */
  interimTranscript: string
}

const LISTENING_TIMEOUT_MS = 8_000

/**
 * "Jait" is not a dictionary word, so Google's speech recognition will
 * transcribe it as various real words depending on accent/language.
 * We match all known variants phonetically.
 */
const DEFAULT_WAKE_PHRASES = [
  // Exact
  'hey jait', 'jait',
  // Common English misrecognitions
  'hey jade', 'jade',
  'hey jayit', 'jayit',
  'hey gate', 'gate',
  'hey jate', 'jate',
  'hey jay', 'jay',
  'hey date', 'date',
  'hey jake', 'jake',
  'hey jet', 'jet',
  'hey jayt', 'jayt',
  'hey jayed', 'jayed',
  'hey jaid', 'jaid',
  'hey jayett', 'jayett',
  'hey jit', 'jit',
  'hey jai', 'jai',
  // German misrecognitions (since your lang might be de)
  'hey dschaid', 'dschaid',
  'hey tscheit', 'tscheit',
  'hey dscheit', 'dscheit',
  'hey tschait', 'tschait',
  'hey jeid', 'jeid',
  'hey jäd', 'jäd',
  'hey tschäd', 'tschäd',
  'hey scheide', 'hey scheid',
  'hey jäit', 'jäit',
]

/**
 * Phonetic check: does the word sound like "jait"?
 * Strips common prefixes and checks if the core sounds like /dʒeɪt/.
 */
function soundsLikeJait(word: string): boolean {
  const w = word.toLowerCase()
    .replace(/^(hey|hej|he)\s+/, '') // strip "hey" prefix
    .replace(/[^a-zäöüß]/g, '')      // strip punctuation
    .trim()

  if (w.length < 2 || w.length > 8) return false

  // Direct matches for common transcriptions
  const directMatches = [
    'jait', 'jade', 'jate', 'gate', 'jay', 'jai', 'jet',
    'jake', 'jayed', 'jaid', 'jayit', 'jayt', 'jayett', 'jit',
    'dschaid', 'tscheit', 'dscheit', 'tschait', 'jeid', 'jäd',
    'tschäd', 'jäit', 'scheid', 'scheide',
  ]
  if (directMatches.includes(w)) return true

  // Phonetic pattern: starts with j/g/dj/dsch/tsch, ends with t/d/te/de
  if (/^(j|g|dj|dsch|tsch|sch)/.test(w) && /(t|d|te|de|ed)$/.test(w)) return true

  return false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionInstance = any

export function useWakeWord(options: UseWakeWordOptions): UseWakeWordReturn {
  const { enabled, lang, wakePhrases, onCommand, onWakeWordDetected, onListeningTimeout } = options

  const [isRunning, setIsRunning] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const isListeningRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enabledRef = useRef(enabled)
  const stoppedIntentionally = useRef(false)

  // Keep refs in sync for use in callbacks
  const onCommandRef = useRef(onCommand)
  onCommandRef.current = onCommand
  const onWakeWordDetectedRef = useRef(onWakeWordDetected)
  onWakeWordDetectedRef.current = onWakeWordDetected
  const onListeningTimeoutRef = useRef(onListeningTimeout)
  onListeningTimeoutRef.current = onListeningTimeout

  enabledRef.current = enabled

  const phrases = wakePhrases ?? DEFAULT_WAKE_PHRASES
  const phrasesRef = useRef(phrases)
  phrasesRef.current = phrases

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const clearListeningTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const exitListeningMode = useCallback(() => {
    isListeningRef.current = false
    setIsListening(false)
    setInterimTranscript('')
    clearListeningTimeout()
  }, [clearListeningTimeout])

  const enterListeningMode = useCallback(() => {
    isListeningRef.current = true
    setIsListening(true)
    setInterimTranscript('')

    // Auto-timeout if user doesn't say anything after the wake word
    clearListeningTimeout()
    timeoutRef.current = setTimeout(() => {
      if (isListeningRef.current) {
        exitListeningMode()
        onListeningTimeoutRef.current?.()
      }
    }, LISTENING_TIMEOUT_MS)
  }, [clearListeningTimeout, exitListeningMode])

  useEffect(() => {
    if (!enabled || !isSupported) {
      // Stop any running recognition
      if (recognitionRef.current) {
        stoppedIntentionally.current = true
        recognitionRef.current.abort()
        recognitionRef.current = null
        setIsRunning(false)
        exitListeningMode()
      }
      return
    }

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return

    const recognition: SpeechRecognitionInstance = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.lang = lang ?? navigator.language ?? 'en-US'

    recognitionRef.current = recognition
    stoppedIntentionally.current = false

    recognition.onstart = () => {
      console.debug('[useWakeWord] SpeechRecognition started — say "Hey Jait" to activate')
      setIsRunning(true)
    }

    recognition.onresult = (event: any) => {
      // Process results from the last result set
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0]?.transcript?.trim() ?? ''
        const isFinal = result.isFinal

        // Debug: log what the Speech API is hearing
        if (transcript) {
          console.debug(`[useWakeWord] ${isFinal ? 'FINAL' : 'interim'}: "${transcript}"`)
        }

        if (isListeningRef.current) {
          // We're in active-listening mode (wake word already triggered)
          if (isFinal && transcript) {
            // Strip any repeated wake phrase from the start
            const cleaned = stripWakePhrase(transcript, phrasesRef.current)
            if (cleaned) {
              onCommandRef.current(cleaned)
            }
            exitListeningMode()
          } else {
            setInterimTranscript(transcript)
          }
        } else {
          // Passive mode — scan for wake phrase via exact list OR phonetic match
          const lower = transcript.toLowerCase()
          const exactMatch = phrasesRef.current.some(p => lower.includes(p.toLowerCase()))
          const phoneticMatch = !exactMatch && transcript.split(/\s+/).some((w: string) => soundsLikeJait(w))
          const matched = exactMatch || phoneticMatch

          if (matched && isFinal) {
            console.debug(`[useWakeWord] Wake word DETECTED in: "${transcript}"`)
            // Check if there's a command after the wake phrase
            const cleaned = stripWakePhrase(transcript, phrasesRef.current)
            onWakeWordDetectedRef.current?.()

            if (cleaned) {
              // Wake word + command in one utterance: "Jait, what's the weather?"
              onCommandRef.current(cleaned)
            } else {
              // Just the wake word — enter listening mode for next utterance
              enterListeningMode()
            }
          } else if (matched) {
            // Interim match — show feedback but wait for final
            setInterimTranscript(transcript)
          }
        }
      }
    }

    recognition.onerror = (event: any) => {
      // "no-speech" and "aborted" are normal — just restart
      if (event.error === 'no-speech' || event.error === 'aborted') return
      // "not-allowed" means mic permission was denied
      if (event.error === 'not-allowed') {
        console.warn('[useWakeWord] Microphone permission denied — disabling wake word')
        stoppedIntentionally.current = true
        return
      }
      console.warn('[useWakeWord] SpeechRecognition error:', event.error)
    }

    recognition.onend = () => {
      setIsRunning(false)
      // Auto-restart unless we intentionally stopped.
      // Use a small delay to avoid rapid restart loops.
      if (enabledRef.current && !stoppedIntentionally.current) {
        setTimeout(() => {
          if (!enabledRef.current || stoppedIntentionally.current) return
          try {
            recognition.start()
          } catch {
            // Already started or DOM not ready
          }
        }, 300)
      }
    }

    try {
      recognition.start()
    } catch {
      // May fail if another recognition is active
    }

    return () => {
      stoppedIntentionally.current = true
      recognition.abort()
      recognitionRef.current = null
      setIsRunning(false)
      exitListeningMode()
    }
  }, [enabled, isSupported, lang, enterListeningMode, exitListeningMode])

  return { isRunning, isListening, isSupported, interimTranscript }
}

/**
 * Remove the wake phrase from the beginning of a transcript and return the
 * remaining command. Returns empty string if nothing remains.
 * Handles both exact phrase matches and phonetic jait-like words.
 */
function stripWakePhrase(transcript: string, phrases: string[]): string {
  let text = transcript.trim()
  const lower = text.toLowerCase()

  // Sort phrases longest-first so "hey jait" is matched before "jait"
  const sorted = [...phrases].sort((a, b) => b.length - a.length)

  let stripped = false
  for (const phrase of sorted) {
    const idx = lower.indexOf(phrase.toLowerCase())
    if (idx !== -1) {
      text = (text.slice(0, idx) + text.slice(idx + phrase.length)).trim()
      stripped = true
      break
    }
  }

  // If no exact phrase matched, try phonetic: strip first word(s) that sound like "jait"
  if (!stripped) {
    const words = text.split(/\s+/)
    // Strip "hey" prefix if present
    let startIdx = 0
    if (words[0]?.toLowerCase() === 'hey' || words[0]?.toLowerCase() === 'hej') {
      startIdx = 1
    }
    if (words[startIdx] && soundsLikeJait(words[startIdx])) {
      text = words.slice(startIdx + 1).join(' ')
    }
  }

  // Strip leading punctuation/comma that might remain: "Jait, do X" → "do X"
  return text.replace(/^[,;:!?\s]+/, '').trim()
}
