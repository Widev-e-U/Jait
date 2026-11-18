const DAY_MS = 86_400_000

/** Prefer the document language so dividers follow the UI locale (today/yesterday or Heute/Gestern). */
function uiLocale(): string {
  if (typeof document !== 'undefined' && document.documentElement.lang) return document.documentElement.lang
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language
  return 'en'
}

export function dayKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

/** True when a message opens a new calendar day compared with the previous message. */
export function needsDayDivider(previous: number | null | undefined, current: number): boolean {
  return previous === null || previous === undefined || dayKey(previous) !== dayKey(current)
}

/**
 * Label for a day divider: relative wording for today/yesterday, otherwise a short date.
 * Older messages in a different year keep the year so long scrollbacks stay unambiguous.
 */
export function dayDividerLabel(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp)
  const today = new Date(now)
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round((startOfDay(today) - startOfDay(date)) / DAY_MS)
  const locale = uiLocale()
  if (days >= 0 && days <= 1) {
    let label: string
    try {
      label = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day')
    } catch {
      label = days === 0 ? 'Today' : 'Yesterday'
    }
    // Intl returns "heute"/"today"; chat dividers read like labels, so capitalize.
    return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1)
  }
  const formatted = (() => {
    try {
      return new Intl.DateTimeFormat(locale, {
        weekday: 'short', day: 'numeric', month: 'short',
        ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' as const }),
      }).format(date)
    } catch {
      return date.toDateString()
    }
  })()
  return formatted.charAt(0).toLocaleUpperCase(locale) + formatted.slice(1)
}
