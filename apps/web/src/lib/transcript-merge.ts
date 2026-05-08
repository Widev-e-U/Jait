function isWordCharacter(value: string | undefined): boolean {
  return !!value && /[\p{L}\p{N}]/u.test(value)
}

function isApostrophe(value: string | undefined): boolean {
  return value === "'" || value === "’"
}

function getLastWord(value: string): string {
  return value.match(/[\p{L}\p{N}'’]+$/u)?.[0] ?? ''
}

export function normalizeTranscript(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function isUsableOverlap(prev: string, transcript: string, length: number): boolean {
  if (length >= 3) return true

  const beforeOverlap = prev[prev.length - length - 1]
  const afterOverlap = transcript[length]
  if (length === 2 && isWordCharacter(beforeOverlap) && afterOverlap && !isWordCharacter(afterOverlap) && !/\s/.test(afterOverlap)) {
    return true
  }

  const lastWord = getLastWord(prev)
  return length === 1 && lastWord.length === 1 && isApostrophe(afterOverlap)
}

function findSuffixPrefixOverlap(prev: string, transcript: string): number {
  const maxOverlap = Math.min(prev.length, transcript.length, 240)
  for (let length = maxOverlap; length > 0; length--) {
    if (!isUsableOverlap(prev, transcript, length)) continue
    if (prev.endsWith(transcript.slice(0, length))) return length
  }
  return 0
}

export function appendTranscript(prev: string, transcript: string): string {
  const normalizedPrev = normalizeTranscript(prev)
  const normalizedTranscript = normalizeTranscript(transcript)
  if (!normalizedTranscript) return normalizedPrev
  if (!normalizedPrev) return normalizedTranscript
  if (normalizedPrev.endsWith(normalizedTranscript)) return normalizedPrev
  if (normalizedTranscript.startsWith(normalizedPrev)) return normalizedTranscript

  const overlap = findSuffixPrefixOverlap(normalizedPrev, normalizedTranscript)
  if (overlap > 0) {
    return `${normalizedPrev}${normalizedTranscript.slice(overlap)}`.trim()
  }

  return `${normalizedPrev} ${normalizedTranscript}`
}
