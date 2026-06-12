export function shouldAutoTitleSession(name: string | null | undefined) {
  const normalized = name?.trim() ?? ''
  return !normalized || normalized === 'New Chat' || normalized.startsWith('Session ')
}

export function deriveSessionTitle(raw: string) {
  const singleLine = raw
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) ?? ''
  if (!singleLine) return ''
  const cleaned = singleLine.replace(/\s+/g, ' ').trim()
  return cleaned.length > 80 ? `${cleaned.slice(0, 77).trimEnd()}...` : cleaned
}
