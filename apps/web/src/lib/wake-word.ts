/** Match only an address at the start of a transcript, never a substring of a word. */
export type WakeMatch = { kind: 'direct' | 'ambiguous'; command: string } | { kind: 'none' }

const DIRECT_NAMES = 'jait|jade|jate|jayit|jayt|jaid|jayed|jayett|jit|dschaid|tscheit|dscheit|tschait|jeid|jäd|tschäd|jäit'
const AMBIGUOUS_NAMES = 'jay|jai|jake|gate|date|jet'
const separator = '[\\s,!.:;?]+'
const endOfName = '(?![\\p{L}\\p{N}])'
const directPattern = new RegExp(`^\\s*(?:(?:hey|hi|hello|hej|okay|ok)${separator}(?:${DIRECT_NAMES})|jait)${endOfName}`, 'iu')
const ambiguousPattern = new RegExp(`^\\s*(?:hey|hi|hello|hej|okay|ok)${separator}(?:${AMBIGUOUS_NAMES})${endOfName}`, 'iu')

export function matchWakeTranscript(transcript: string, customPhrases?: string[]): WakeMatch {
  const customMatch = customPhrases?.length
    ? [...customPhrases].sort((a, b) => b.length - a.length)
      .map(phrase => new RegExp(`^\\s*${phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, separator)}${endOfName}`, 'iu').exec(transcript))
      .find(Boolean)
    : undefined
  const direct = customPhrases?.length ? customMatch : directPattern.exec(transcript)
  if (direct) return { kind: 'direct', command: transcript.slice(direct[0].length).replace(/^[\s,!.:;?]+/u, '').trim() }
  if (!customPhrases?.length) {
    const candidate = ambiguousPattern.exec(transcript)
    if (candidate) return { kind: 'ambiguous', command: transcript.slice(candidate[0].length).replace(/^[\s,!.:;?]+/u, '').trim() }
  }
  return { kind: 'none' }
}
