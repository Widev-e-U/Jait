export const VOICE_LEVEL_BAR_COUNT = 28
export const VOICE_LEVEL_FLOOR = 0.05

export function createSilentVoiceLevels(): number[] {
  return Array.from({ length: VOICE_LEVEL_BAR_COUNT }, () => VOICE_LEVEL_FLOOR)
}

/** Convert unsigned PCM samples into a normalized microphone level. */
export function measureVoiceLevel(samples: Uint8Array): number {
  if (samples.length === 0) return VOICE_LEVEL_FLOOR
  let total = 0
  for (const sample of samples) total += Math.abs((sample - 128) / 128)
  return Math.max(VOICE_LEVEL_FLOOR, Math.pow(Math.min(1, total / samples.length * 6.8), 0.78))
}

export function summarizeForVoice(text: string, maxLength = 220): string {
  const normalized = text
    .replace(/```[\s\S]*?```/g, ' code omitted ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return ''
  const firstSentence = normalized.match(/[^.!?]+[.!?]/)?.[0]?.trim() ?? normalized
  if (firstSentence.length <= maxLength) return firstSentence
  return `${firstSentence.slice(0, maxLength - 1).trimEnd()}…`
}
