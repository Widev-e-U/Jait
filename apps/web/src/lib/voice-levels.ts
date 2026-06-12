export const VOICE_LEVEL_BAR_COUNT = 28
export const VOICE_LEVEL_FLOOR = 0.05

export function createSilentVoiceLevels(): number[] {
  return Array.from({ length: VOICE_LEVEL_BAR_COUNT }, () => VOICE_LEVEL_FLOOR)
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
