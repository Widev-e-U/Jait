/**
 * Live provider subscription usage, grouped by configured provider profile.
 */
import { useCallback, useEffect, useState } from 'react'
import { Brain, Loader2, RefreshCw } from 'lucide-react'
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

function ProfileUsage({ profile }: { profile: UsageProfile }) {
  const plan = profile.quotas.find((quota) => quota.planType)?.planType
  const credits = profile.quotas.find((quota) => quota.credits)?.credits

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{profile.profileLabel}</h3>
          <p className="text-sm text-muted-foreground">
            {profile.providerLabel} · {profile.locationLabel}
          </p>
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

      {profile.error && profile.quotas.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Refresh issue: {profile.error}</p>
      )}
    </div>
  )
}

export function UsageModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const token = getAuthToken()
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/api/provider-usage/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error(`Usage request failed (${response.status})`)
      const data = (await response.json()) as UsageSummary
      setSummary(data)
      setSelectedId((current) => {
        const ids = data.profiles.map((profile) => profile.id)
        return current && ids.includes(current) ? current : (ids[0] ?? null)
      })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load provider usage')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const profiles = summary?.profiles ?? []
  const selected = profiles.find((profile) => profile.id === selectedId) ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl">
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
              disabled={loading}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </DialogHeader>

        {loading && !summary ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading provider limits…</span>
          </div>
        ) : error ? (
          <div className="py-10 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button className="mt-2 text-sm underline underline-offset-4" onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : profiles.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No Codex or Claude profiles and no Ollama Jait backend are configured.
          </p>
        ) : (
          <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 pb-1">
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

            {selected && <ProfileUsage profile={selected} />}

            <p className="text-[11px] text-muted-foreground">
              Refreshed {formatDateTime(summary?.generatedAt ?? null)}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
