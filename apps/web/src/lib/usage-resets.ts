/**
 * Reset deadlines for provider subscription quotas.
 *
 * Resets reach the web client as ISO strings on `ProviderUsageSnapshot.resetsAt`
 * together with an optional `resetSource` describing how confident the gateway
 * is about the timestamp. Codex, Claude Code and OpenCode Go report real
 * deadlines; Ollama reconstructs them, so the same UI must distinguish the two.
 */

/** Matches `OllamaResetSource` in the gateway without importing gateway code. */
export type UsageResetSource = 'provider-reported' | 'observed' | 'window-boundary' | 'window-grid'

export interface UsageResetDisplay {
  /** Short relative label, e.g. `Resets in 2h 14m`. */
  text: string
  /** Absolute deadline, e.g. `Jul 4, 3:00 PM`. */
  at: string
  /** The deadline is an estimate, not something the provider reported. */
  estimated: boolean
  /** The deadline is already in the past and the row has not been refreshed. */
  elapsed: boolean
  /** Tooltip text explaining where the timestamp came from. */
  title: string
}

export const QUOTA_LABELS: Record<string, string> = {
  request_activity: 'Request activity',
  five_hour: '5-hour limit',
  seven_day: 'Weekly limit',
  seven_day_opus: 'Opus weekly limit',
  seven_day_sonnet: 'Sonnet weekly limit',
  seven_day_overage_included: 'Weekly extra usage',
  monthly: 'Monthly limit',
  weekly: 'Weekly limit',
  rolling: 'Rolling window',
  overage: 'Extra usage',
  primary: 'Primary limit',
  secondary: 'Secondary limit',
}

export function quotaLabel(rateLimitType: string | null | undefined): string {
  if (!rateLimitType) return 'Limit'
  return QUOTA_LABELS[rateLimitType] ?? rateLimitType.replace(/_/g, ' ')
}

/** Parse an ISO deadline, returning null for missing or unparseable values. */
export function parseResetAt(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatResetAt(date: Date): string {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** `under a minute`, `12m`, `3h 5m`, `2d 4h` — coarse on purpose. */
export function formatResetCountdown(date: Date, now: Date = new Date()): string {
  const remainingMs = date.getTime() - now.getTime()
  if (remainingMs <= 0) return 'now'
  const minutes = Math.floor(remainingMs / 60_000)
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours < 24) return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours ? `${days}d ${restHours}h` : `${days}d`
}

/** Human-readable provenance of a deadline, mirroring the gateway wording. */
export function describeUsageResetSource(source: UsageResetSource | null | undefined): string {
  switch (source) {
    case 'provider-reported':
      return 'Reported by the provider'
    case 'observed':
      return 'Confirmed by an observed usage reset'
    case 'window-boundary':
      return 'Continued from the previous reset deadline'
    case 'window-grid':
      return 'Estimated from usage window boundaries'
    default:
      return 'Reset deadline from the last reported usage window'
  }
}

/**
 * Build the label for a quota row. Returns null when there is no usable
 * deadline so callers can omit the line entirely.
 */
export function describeUsageReset(
  resetsAt: string | null | undefined,
  source: UsageResetSource | string | null | undefined,
  now: Date = new Date(),
): UsageResetDisplay | null {
  const date = parseResetAt(resetsAt)
  if (!date) return null
  const normalized = isResetSource(source) ? source : null
  const elapsed = date.getTime() <= now.getTime()
  const estimated = normalized === 'window-grid' || normalized === 'window-boundary'
  const at = formatResetAt(date)
  const provenance = describeUsageResetSource(normalized)
  return {
    text: elapsed ? 'Reset time passed — refresh for the next window' : `Resets in ${formatResetCountdown(date, now)}`,
    at,
    estimated,
    elapsed,
    title: elapsed ? `Resets ${at} (${provenance})` : `Resets ${at} — ${provenance}`,
  }
}

function isResetSource(value: unknown): value is UsageResetSource {
  return value === 'provider-reported'
    || value === 'observed'
    || value === 'window-boundary'
    || value === 'window-grid'
}

/**
 * "Reset buttons": free usage-limit resets the provider granted and the user
 * can spend to clear limits immediately (Codex's `rateLimitResetCredits`).
 */
export interface UsageResetCredit {
  title?: string | null
  description?: string | null
  status?: string | null
  /** Epoch seconds, matching Codex's app-server payload. */
  grantedAt?: number | null
  expiresAt?: number | null
}

export interface UsageResetCredits {
  availableCount?: number | null
  credits?: UsageResetCredit[] | null
}

export interface ResetCreditsDisplay {
  count: number
  /** Short label, e.g. `2 resets available`. */
  text: string
  /** Tooltip listing each credit with its expiry. */
  title: string
}

/** Returns null when the account has no spendable resets, so callers can hide the line. */
export function describeResetCredits(
  credits: UsageResetCredits | null | undefined,
): ResetCreditsDisplay | null {
  if (!credits || typeof credits !== 'object') return null
  const listed = Array.isArray(credits.credits)
    ? credits.credits.filter(
        (credit): credit is UsageResetCredit =>
          !!credit && typeof credit === 'object' && (credit.status == null || credit.status === 'available'),
      )
    : []
  const count = typeof credits.availableCount === 'number' ? credits.availableCount : listed.length
  if (count <= 0) return null
  const lines = listed.map((credit) => {
    const label = typeof credit.title === 'string' && credit.title ? credit.title : 'Usage limit reset'
    const expires = typeof credit.expiresAt === 'number' && Number.isFinite(credit.expiresAt * 1000)
      ? formatResetAt(new Date(credit.expiresAt * 1000))
      : null
    return expires ? `${label} — expires ${expires}` : label
  })
  return {
    count,
    text: count === 1 ? '1 reset available' : `${count} resets available`,
    title: lines.length > 0 ? lines.join('\n') : `${count} usage ${count === 1 ? 'reset' : 'resets'} available`,
  }
}
