/**
 * Past-oriented relative time label for activity timestamps, shared by every
 * surface that lists chats/sessions (sidebar, session dropdowns, headers).
 * Returns "just now", "5m ago", "3h ago", or the locale date beyond a day.
 */
export function formatAgo(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleDateString()
}