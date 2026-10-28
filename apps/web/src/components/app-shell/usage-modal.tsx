/**
 * Live provider subscription usage, grouped by configured provider profile.
 */
import type { OllamaUsageSetup } from '@jait/shared'
import { OllamaUsageSetupPanel } from './ollama-usage-setup'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getAuthToken } from '@/lib/auth-token'
import { providerIcon } from '@/components/icons/provider-icons'
import { describeResetCredits, describeUsageReset, quotaLabel, type UsageResetCredits } from '@/lib/usage-resets'

import { getUsageSummary, subscribeUsageSummary, refreshUsageSummary } from '@/lib/usage-summary-store'
import { TooltipHint } from '@/components/ui/tooltip'

interface UsageQuotaSnapshot {
  accountId: string
  rateLimitType: string
  providerType: string
  status: string | null
  utilization: number | null
  resetsAt: string | null
  /** How the gateway obtained `resetsAt`; Ollama reconstructs, other providers report. */
  resetSource?: string | null
  isUsingOverage: boolean
  updatedAt: string
  planType: string | null
  windowDurationMins: number | null
  credits: {
    hasCredits?: boolean
    unlimited?: boolean
    balance?: string | null
  } | null
  /** Unused "reset buttons" the provider granted (Codex's rate limit reset credits). */
  resetCredits?: UsageResetCredits | null
  models: Array<{ name: string; requestCount: number }>
  activityCost: string | null
  requestCount?: number | null
  quotaRefreshMissing?: boolean
  usagePeriod?: { from: string; until: string; range: string } | null
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

export interface UsageSummary {
  generatedAt: string
  profiles: UsageProfile[]
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

function UsageBar({ quota }: { quota: UsageQuotaSnapshot }) {
  const percent = quota.utilization == null
    ? null
    : Math.round(Math.min(1, Math.max(0, quota.utilization)) * 100)
  const reset = quota.quotaRefreshMissing ? null : describeUsageReset(quota.resetsAt, quota.resetSource ?? null)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{quota.providerType === 'ollama' && quota.rateLimitType === 'five_hour' ? 'Session usage (5-hour limit)' : quotaLabel(quota.rateLimitType)}</span>
        <span className="shrink-0 tabular-nums font-medium">
          {quota.requestCount != null ? `${quota.requestCount.toLocaleString()} requests` : percent == null ? (quota.status ?? 'Unavailable') : `${percent}% used${quota.status === 'rejected' && percent < 100 ? ' · limit reached' : ''}${quota.quotaRefreshMissing ? ' (last reported)' : ''}`}
        </span>
      </div>
      {percent != null && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${
              quota.status === 'rejected' || percent >= 90 ? 'bg-red-500' : percent >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {quota.usagePeriod && <span>{formatDateTime(quota.usagePeriod.from)} – {formatDateTime(quota.usagePeriod.until)}</span>}
        {reset && (
          <TooltipHint content={reset.title}>
            <span>
              {reset.text}
              {reset.estimated ? ' · est.' : ''}
            </span>
          </TooltipHint>
        )}
        <span>Updated {formatDateTime(quota.updatedAt)}</span>
        {quota.activityCost && <span>Cost {quota.activityCost}</span>}
      </div>
      {quota.quotaRefreshMissing && <p className="text-xs text-muted-foreground">Last reported quota. The latest Ollama response did not refresh session or weekly usage.</p>}
      {quota.requestCount != null && <p className="text-xs text-muted-foreground">This response contains request activity only; it does not refresh subscription quota.</p>}
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
  const resetCredits = describeResetCredits(profile.quotas.find((quota) => quota.resetCredits)?.resetCredits)

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
          {resetCredits && (
            <TooltipHint content={`${resetCredits.title}\nSpend a reset in the provider's app to clear your limits immediately.`}>
              <p
                className="text-xs text-emerald-600 dark:text-emerald-400"
              >
                ↺ {resetCredits.text}
              </p>
            </TooltipHint>
          )}
        </div>
        {plan && (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs capitalize text-muted-foreground">
            {plan}
          </span>
        )}
      </div>

      {profile.error && profile.quotas.length > 0 && (
        <p role="status" className="text-sm text-destructive">Could not refresh usage: {profile.error}</p>
      )}

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

      {profile.providerType === 'ollama' && (profile.error || profile.quotas.length === 0 || profile.quotas.every(quota => quota.rateLimitType === 'request_activity')) && (
        <OllamaUsageSetupPanel setup={profile.ollamaSetup} connected={Boolean(profile.accountLabel)} retry={retry} loading={loading} />
      )}
      {profile.providerType === 'ollama' && !profile.error && profile.quotas.some(quota => quota.rateLimitType !== 'request_activity') && (
        <details><summary className="cursor-pointer text-xs text-muted-foreground">Manage Ollama usage connection</summary>
          <OllamaUsageSetupPanel setup={profile.ollamaSetup} connected={Boolean(profile.accountLabel)} retry={retry} loading={loading} />
        </details>
      )}
      {profile.providerType === 'ollama' && !profile.error && profile.quotas.some(quota => quota.rateLimitType !== 'request_activity') && (
        <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400">Connected — showing the last reported cloud usage.</p>
      )}

      {profile.error && profile.quotas.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Refresh issue: {profile.error}</p>
      )}
    </div>
  )
}

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
  const token = getAuthToken()
  const summary = useSyncExternalStore(subscribeUsageSummary, getUsageSummary, () => null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async (force = true, quiet = false) => {
    if (!getAuthToken()) return
    if (!quiet) {
      setError(null)
      setLoading(!getUsageSummary())
      setRefreshing(true)
    }
    try { await refreshUsageSummary(force) }
    catch (error) {
      if (!quiet) setError(error instanceof Error ? error.message : 'Failed to load provider usage')
    } finally {
      if (!quiet) { setLoading(false); setRefreshing(false) }
    }
  }, [])

  // Prepare usage before opening the modal. Hidden and idle clients do no work.
  // Multiple mounted headers share the store's promise and freshness timestamp.
  useEffect(() => {
    if (!token) return
    let lastActiveAt = Date.now()
    const refresh = () => {
      if (document.visibilityState === 'visible' && navigator.onLine
        && Date.now() - lastActiveAt < 10 * 60_000) void load(false, true)
    }
    const active = () => { lastActiveAt = Date.now(); refresh() }
    const visible = () => { if (document.visibilityState === 'visible') active() }
    refresh()
    const interval = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('online', active)
    window.addEventListener('pointerdown', active, { passive: true })
    window.addEventListener('keydown', active)
    window.addEventListener('wheel', active, { passive: true })
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('online', active)
      window.removeEventListener('pointerdown', active)
      window.removeEventListener('keydown', active)
      window.removeEventListener('wheel', active)
    }
  }, [token, load])

  useEffect(() => {
    if (open) void load(false)
  }, [open, token, load])

  const profiles = summary?.profiles ?? []
  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0] ?? null
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
                const Icon = providerIcon(profile.providerType)
                const active = profile.id === selectedId
                const bestPercent = Math.max(
                  -1,
                  ...profile.quotas
                    .map((quota) => quota.utilization)
                    .filter((value): value is number => value != null),
                )
                // A workspace can be blocked while its windows are below 100%
                // (e.g. exhausted credits), so the stored status is authoritative.
                const exhausted = profile.quotas.some((quota) => quota.status === 'rejected')
                return (
                  <button
                    type="button"
                    key={profile.id}
                    onClick={() => setSelectedId(profile.id)}
                    className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                      active ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                  >
                    <span aria-hidden="true"><Icon size={17} className="shrink-0" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{profile.providerLabel}</span>
                      <span className="block truncate text-xs text-muted-foreground">{profile.profileLabel}</span>
                    </span>
                    {exhausted ? (
                      <span className="shrink-0 rounded-full bg-red-500/10 px-1.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                        Full
                      </span>
                    ) : bestPercent >= 0 && (
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
              {refreshing ? 'Refreshing live limits…' : <>Last checked {formatDateTime(summary?.generatedAt ?? null)}</>}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
