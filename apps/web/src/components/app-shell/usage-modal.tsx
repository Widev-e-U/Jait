/**
 * Live provider subscription usage, grouped by configured provider profile.
 */
import type { OllamaUsageSetup } from '@jait/shared'
import { OllamaUsageSetupPanel } from './ollama-usage-setup'
import { useCallback, useEffect, useState } from 'react'
import { Brain, RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getApiUrl } from '@/lib/gateway-url'
import { getAuthToken } from '@/lib/auth-token'
import { Claude, JaitIcon, Ollama, OpenAI } from '@/components/icons/model-icons'

const API_URL = getApiUrl()

interface UsageQuotaSnapshot {
  accountId: string
  rateLimitType: string
  providerType: string
  status: string | null
  utilization: number | null
  resetsAt: string | null
  isUsingOverage: boolean
  updatedAt: string
  planType: string | null
  windowDurationMins: number | null
  credits: {
    hasCredits?: boolean
    unlimited?: boolean
    balance?: string | null
  } | null
  models: Array<{ name: string; requestCount: number }>
  activityCost: string | null
}

interface UsageProfile {
  id: string
  providerType: string
  providerLabel: string
  profileLabel: string
  locationLabel: string
  /** Signed-in account behind the profile (e.g. the Ollama Cloud email). */
  accountLabel?: string | null
  /** Subscription plan reported by the provider (e.g. Codex "plus"). */
  planType?: string | null
  ollamaSetup?: OllamaUsageSetup
  quotas: UsageQuotaSnapshot[]
  error: string | null
}

interface UsageSummary {
  generatedAt: string
  profiles: UsageProfile[]
}

const PROVIDER_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  codex: OpenAI,
  openai: OpenAI,
  'claude-code': Claude,
  ollama: Ollama,
  jait: JaitIcon,
  pi: Brain,
}

const QUOTA_LABELS: Record<string, string> = {
  five_hour: '5-hour limit',
  seven_day: 'Weekly limit',
  seven_day_opus: 'Opus weekly limit',
  seven_day_sonnet: 'Sonnet weekly limit',
  seven_day_overage_included: 'Weekly extra usage',
  monthly: 'Monthly limit',
  overage: 'Extra usage',
  primary: 'Primary limit',
  secondary: 'Secondary limit',
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatReset(iso: string | null): string | null {
  if (!iso) return null
  const formatted = formatDateTime(iso)
  return formatted === '—' ? null : `Resets ${formatted}`
}

function UsageBar({ quota }: { quota: UsageQuotaSnapshot }) {
  const percent = quota.utilization == null
    ? null
    : Math.round(Math.min(1, Math.max(0, quota.utilization)) * 100)
  const reset = formatReset(quota.resetsAt)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{QUOTA_LABELS[quota.rateLimitType] ?? quota.rateLimitType}</span>
        <span className="shrink-0 tabular-nums font-medium">
          {percent == null ? (quota.status ?? 'Unavailable') : `${percent}% used`}
        </span>
      </div>
      {percent != null && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${
              percent >= 90 ? 'bg-red-500' : percent >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {reset && <span>{reset}</span>}
        <span>Updated {formatDateTime(quota.updatedAt)}</span>
        {quota.activityCost && <span>Cost {quota.activityCost}</span>}
      </div>
      {quota.models.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {quota.models.map((model) => (
            <span key={model.name} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {model.name}: {model.requestCount}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ProfileUsage({ profile, retry, loading }: { profile: UsageProfile; retry: () => Promise<void>; loading: boolean }) {
  const plan = profile.planType ?? profile.quotas.find((quota) => quota.planType)?.planType
  const credits = profile.quotas.find((quota) => quota.credits)?.credits

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{profile.profileLabel}</h3>
          <p className="text-sm text-muted-foreground">
            {profile.providerLabel} · {profile.locationLabel}
          </p>
          {profile.accountLabel && (
            <p className="truncate text-xs text-muted-foreground">{profile.accountLabel}</p>
          )}
        </div>
        {plan && (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs capitalize text-muted-foreground">
            {plan}
          </span>
        )}
      </div>

      {profile.quotas.length > 0 ? (
        <div className="space-y-4 rounded-lg border p-4">
          {profile.quotas.map((quota) => (
            <UsageBar key={quota.rateLimitType} quota={quota} />
          ))}
          {credits && (
            <p className="border-t pt-3 text-xs text-muted-foreground">
              Credits: {credits.unlimited ? 'Unlimited' : (credits.balance ?? (credits.hasCredits ? 'Available' : 'None'))}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {profile.error ?? (
            profile.providerType === 'claude-code'
              ? 'Claude has not reported subscription limits for this profile yet. Start a Claude chat once, then refresh.'
              : 'This provider did not return subscription usage.'
          )}
        </div>
      )}

      {profile.providerType === 'ollama' && (profile.error || profile.quotas.length === 0) && (
        <OllamaUsageSetupPanel setup={profile.ollamaSetup} connected={Boolean(profile.accountLabel)} retry={retry} loading={loading} />
      )}
      {profile.providerType === 'ollama' && !profile.error && profile.quotas.length > 0 && (
        <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400">Connected — cloud usage is up to date.</p>
      )}

      {profile.error && profile.quotas.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Refresh issue: {profile.error}</p>
      )}
    </div>
  )
}

/** localStorage key for the last successful summary, shared across reloads. */
const SUMMARY_CACHE_KEY = 'jait.usage-summary.v1'

/**
 * Read the last persisted summary so the modal can render the real provider
 * grid (same size, all options) on the very first paint instead of a generic
 * skeleton. Transient per-request fields are dropped so a stale error or setup
 * hint never survives a reload.
 */
function readStoredSummary(): UsageSummary | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SUMMARY_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as UsageSummary | null
    if (!parsed || !Array.isArray(parsed.profiles)) return null
    return {
      ...parsed,
      profiles: parsed.profiles.map((profile) => ({
        ...profile,
        error: null,
        ollamaSetup: undefined,
      })),
    }
  } catch {
    return null
  }
}

function writeStoredSummary(summary: UsageSummary): void {
  if (typeof window === 'undefined') return
  try {
    const profiles = summary.profiles.map((profile) => ({
      ...profile,
      error: null,
      ollamaSetup: undefined,
    }))
    window.localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify({ ...summary, profiles }))
  } catch {
    // Storage can be unavailable (quota exceeded or private mode); the in-memory
    // cache below still carries the summary within the session.
  }
}

/**
 * Last successful summary, kept outside React state so reopening the modal (or
 * remounting it) shows the known providers immediately while the refresh runs.
 * Seeded from localStorage as well so a full page reload keeps the layout.
 */
let cachedSummary: UsageSummary | null = readStoredSummary()

/**
 * Full-size placeholder shown while the first usage response is in flight, so the
 * dialog keeps the same shape (provider grid + detail pane) instead of popping
 * from a small spinner to the full layout.
 */
function UsageModalSkeleton() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden"
      aria-busy="true"
      data-testid="usage-modal-loading"
    >
      <span className="sr-only">Loading provider limits…</span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-center gap-2 rounded-lg border p-2.5">
            <div className="h-[17px] w-[17px] shrink-0 animate-pulse rounded bg-muted" />
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="block h-3.5 w-full max-w-[7rem] animate-pulse rounded bg-muted" />
              <span className="block h-3 w-full max-w-[5rem] animate-pulse rounded bg-muted" />
            </span>
            <div className="h-3 w-7 shrink-0 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>

      <div className="space-y-4" aria-hidden="true">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-44 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-6 w-14 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="space-y-4 rounded-lg border p-4">
          {[0, 1, 2].map((index) => (
            <div key={index} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
              <div className="h-3 w-40 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>

      <div className="h-3 w-32 animate-pulse rounded bg-muted" aria-hidden="true" />
    </div>
  )
}

export function UsageModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [summary, setSummary] = useState<UsageSummary | null>(() => cachedSummary)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const applySummary = useCallback((data: UsageSummary) => {
    cachedSummary = data
    writeStoredSummary(data)
    setSummary(data)
    setSelectedId((current) => {
      const ids = data.profiles.map((profile) => profile.id)
      return current && ids.includes(current) ? current : (ids[0] ?? null)
    })
  }, [])

  /**
   * Two phases so the dialog never jumps from a small spinner to the full layout:
   *  1. `refresh=0` paints the last known snapshots — every configured profile
   *     plus its cached numbers — without touching the provider APIs.
   *  2. a live refresh then upgrades utilisation and reset dates in place.
   */
  const load = useCallback(async () => {
    const token = getAuthToken()
    if (!token) {
      setError('Sign in to view provider usage.')
      setLoading(false)
      setRefreshing(false)
      return
    }
    setError(null)
    setLoading(true)

    let painted = false
    try {
      const response = await fetch(`${API_URL}/api/provider-usage/summary?refresh=0`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error(`Usage request failed (${response.status})`)
      applySummary((await response.json()) as UsageSummary)
      painted = true
    } catch {
      // Keep the skeleton up; the live refresh below may still succeed.
    }
    if (painted) setLoading(false)

    setRefreshing(true)
    try {
      const response = await fetch(`${API_URL}/api/provider-usage/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error(`Usage request failed (${response.status})`)
      applySummary((await response.json()) as UsageSummary)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load provider usage')
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }, [applySummary])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const profiles = summary?.profiles ?? []
  const selected = profiles.find((profile) => profile.id === selectedId) ?? null
  const busy = loading || refreshing

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] min-h-[26rem] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 pr-7">
            <div>
              <DialogTitle>Provider usage</DialogTitle>
              <DialogDescription>
                Subscription limits from each connected profile.
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </DialogHeader>

        {loading && !summary ? (
          <UsageModalSkeleton />
        ) : error && !summary ? (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button className="mt-2 text-sm underline underline-offset-4" onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : profiles.length === 0 ? (
          <p className="flex flex-1 items-center justify-center py-10 text-center text-sm text-muted-foreground">
            No Codex or Claude profiles and no Ollama Jait backend are configured.
          </p>
        ) : (
          <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 pb-1">
            {error && (
              <p role="status" className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                {error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {profiles.map((profile) => {
                const Icon = PROVIDER_ICONS[profile.providerType] ?? Brain
                const active = profile.id === selectedId
                const bestPercent = Math.max(
                  -1,
                  ...profile.quotas
                    .map((quota) => quota.utilization)
                    .filter((value): value is number => value != null),
                )
                return (
                  <button
                    type="button"
                    key={profile.id}
                    onClick={() => setSelectedId(profile.id)}
                    className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                      active ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                  >
                    <Icon size={17} className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{profile.providerLabel}</span>
                      <span className="block truncate text-xs text-muted-foreground">{profile.profileLabel}</span>
                    </span>
                    {bestPercent >= 0 && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {Math.round(bestPercent * 100)}%
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {selected && <ProfileUsage key={selected.id} profile={selected} retry={load} loading={busy} />}

            <p className="text-[11px] text-muted-foreground">
              {refreshing ? 'Refreshing live limits…' : <>Refreshed {formatDateTime(summary?.generatedAt ?? null)}</>}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
