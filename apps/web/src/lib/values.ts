/** Generic value-normalization helpers shared across the app. */

export function getNonEmptyMessage(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}
