/**
 * Provider usage modal.
 *
 * Opened from the avatar dropdown ("Usage" item). Shows every connected
 * provider with its historical chat-request counts bucketed hourly / daily /
 * weekly, plus any live quota snapshots reported by the gateway.
 *
 * Data comes from GET /api/provider-usage/summary (see gateway
 * src/services/usage-summary.ts). No chart library — plain flex/CSS bars.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Brain, Loader2, RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getApiUrl } from '@/lib/gateway-url'
import { getAuthToken } from '@/lib/auth-token'
import { Claude, JaitIcon, Ollama, OpenAI } from '@/components/icons/model-icons'

const API_URL = getApiUrl()

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS

type RangeKey = 'hourly' | 'daily' | 'weekly'

/** UsageBucket — bucket start timestamp (ms) + request count. */
interface UsageBucket {
  t: number
  c: number
}

/** Mirrors gateway src/services/usage-summary.ts → UsageProviderSummary. */
interface UsageProviderSummary {
  /** Canonical provider type: `codex`, `claude-code`, `ollama`, `jait`, … */
  type: string
  label: string
  /** Provider-account id when usage ran through a named account, else null. */
  accountId: string | null
  accountLabel: string | null
  chatRequests: number
  threadRuns: number
  total: number
  lastUsedAt: string | null
  /** Oldest-first request counts: 24×1h, 30×1d, 12×7d (last = current bucket). */
  hourly: number[]
  daily: number[]
  weekly: number[]
}

/** Mirrors gateway src/services/provider-usage.ts → ProviderUsageSnapshot. */
interface UsageQuotaSnapshot {
  accountId: string
  rateLimitType: string
  providerType: string
  status: string | null
  utilization: number | null
  resetsAt: string | null
  isUsingOverage: boolean
  updatedAt: string
}

/** Mirrors gateway src/services/usage-summary.ts → UsageSummaryPayload. */
interface UsageSummary {
  generatedAt: string
  providers: UsageProviderSummary[]
  quotas: UsageQuotaSnapshot[]
}

const PROVIDER_LABELS: Record<string, string> = {
  codex: 'OpenAI Codex',
  openai: 'OpenAI',
  'claude-code': 'Claude Code',
  ollama: 'Ollama',
  jait: 'Jait Cloud',
  pi: 'Pi',
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
  five_hour: 'Session limit',
  seven_day: 'Weekly limit',
  seven_day_opus: 'Opus weekly limit',
  seven_day_sonnet: 'Sonnet weekly limit',
  overage: 'Extra usage',
}

/** Bucket-window geometry per range — must match gateway usage-summary.ts. */
const BUCKET_WINDOWS: Record<RangeKey, { count: number; spanMs: number }> = {
  hourly: { count: 24, spanMs: HOUR_MS },
  daily: { count: 30, spanMs: DAY_MS },
  weekly: { count: 12, spanMs: WEEK_MS },
}

/** Stable identity for a (type, account) usage row. */
function providerKey(provider: UsageProviderSummary): string {
  return `${provider.type}|${provider.accountId ?? ''}`
}

function providerName(provider: UsageProviderSummary): string {
  return PROVIDER_LABELS[provider.type] ?? provider.label ?? provider.type
}

function providerIcon(provider: UsageProviderSummary) {
  return PROVIDER_ICONS[provider.type] ?? Brain
}

/** Convert the gateway's oldest-first count arrays into {t, c} chart buckets. */
function bucketSeries(provider: UsageProviderSummary, range: RangeKey, now: number): UsageBucket[] {
  const { count, spanMs } = BUCKET_WINDOWS[range]
  const counts = provider[range]
  return counts.map((c, index) => ({ t: now - (count - index) * spanMs, c: c ?? 0 }))
}

function bucketLabel(ts: number, range: RangeKey): string {
  const date = new Date(ts)
  if (range === 'hourly') return date.toLocaleTimeString(undefined, { hour: 'numeric' })
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
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

function formatResetsAt(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return `Resets ${date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
}

/** CSS-bar histogram for one provider + range. Zero buckets stay visible as ticks. */
function UsageChart({ buckets, range }: { buckets: UsageBucket[]; range: RangeKey }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.c))
  const total = buckets.reduce((sum, bucket) => sum + bucket.c, 0)
  // Show ~7 evenly spaced axis labels.
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 7))
  return (
    <div>
      <div className="flex h-36 items-end gap-[2px]" aria-hidden="true">
        {buckets.map((bucket, index) => (
          <div
            key={index}
            title={`${bucketLabel(bucket.t, range)} — ${bucket.c} request${bucket.c === 1 ? '' : 's'}`}
            className="group relative flex h-full min-w-0 flex-1 cursor-default items-end"
          >
            <div
              className={`w-full rounded-t-[2px] transition-colors ${
                bucket.c > 0 ? 'bg-primary/60 group-hover:bg-primary' : 'bg-muted'
              }`}
              style={{ height: bucket.c > 0 ? `${Math.max(4, (bucket.c / max) * 100)}%` : '2px' }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-muted-foreground">
        {buckets.map((bucket, index) => (
          <span key={index} className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
            {index % labelEvery === 0 ? bucketLabel(bucket.t, range) : ''}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {total} request{total === 1 ? '' : 's'} in this window · peak {max}/bucket
      </p>
    </div>
  )
}

export function UsageModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [range, setRange] = useState<RangeKey>('daily')

  const load = useCallback(async () => {
    const token = getAuthToken()
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/provider-usage/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Usage request failed (${res.status})`)
      const data = (await res.json()) as UsageSummary
      setSummary(data)
      setSelectedKey((prev) => {
        const keys = (data.providers ?? []).map(providerKey)
        if (prev && keys.includes(prev)) return prev
        return keys[0] ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const providers = useMemo(() => summary?.providers ?? [], [summary])
  const selected = useMemo(
    () => providers.find((provider) => providerKey(provider) === selectedKey) ?? null,
    [providers, selectedKey],
  )

  // Backend sends oldest-first count arrays — anchor buckets to load time.
  const fetchedAt = useMemo(() => {
    const ts = summary ? Date.parse(summary.generatedAt) : NaN
    return Number.isFinite(ts) ? ts : Date.now()
  }, [summary])
  const buckets = useMemo(
    () => (selected ? bucketSeries(selected, range, fetchedAt) : []),
    [selected, range, fetchedAt],
  )

  // Quota snapshots are account-scoped and live at payload top level.
  const selectedQuotas = useMemo(
    () => (selected?.accountId ? (summary?.quotas ?? []).filter((quota) => quota.accountId === selected.accountId) : []),
    [summary, selected],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Provider usage</DialogTitle>
          <DialogDescription>
            Historical activity per connected provider — chat requests over the last hours, days and weeks.
          </DialogDescription>
        </DialogHeader>

        {loading && !summary ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading usage…</span>
          </div>
        ) : error ? (
          <div className="py-10 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button className="mt-2 text-sm underline underline-offset-4" onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : providers.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No provider usage recorded yet. Send a chat message and come back.
          </p>
        ) : (
          <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 pb-1">
            {/* Provider picker */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {providers.map((provider) => {
                const Icon = providerIcon(provider)
                const active = providerKey(provider) === selectedKey
                return (
                  <button
                    key={providerKey(provider)}
                    onClick={() => setSelectedKey(providerKey(provider))}
                    className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                      active ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{providerName(provider)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {provider.accountLabel ? `${provider.accountLabel} · ` : ''}
                        {provider.chatRequests} chat{provider.chatRequests === 1 ? '' : 's'}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            {selected && (
              <>
                {/* Totals */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Chat requests</p>
                    <p className="text-lg font-semibold">{selected.chatRequests}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Thread runs</p>
                    <p className="text-lg font-semibold">{selected.threadRuns}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Last activity</p>
                    <p className="truncate text-sm font-medium">{formatDateTime(selected.lastUsedAt)}</p>
                  </div>
                </div>

                {/* Range + chart */}
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 rounded-full border bg-muted/50 p-0.5">
                      {(Object.keys(BUCKET_WINDOWS) as RangeKey[]).map((key) => (
                        <button
                          key={key}
                          onClick={() => setRange(key)}
                          className={`rounded-full px-2.5 py-1 text-xs capitalize transition-colors ${
                            range === key
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {key}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => void load()}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
                    </button>
                  </div>
                  {buckets.some((bucket) => bucket.c > 0) ? (
                    <UsageChart buckets={buckets} range={range} />
                  ) : (
                    <p className="py-6 text-center text-sm text-muted-foreground">No activity in this window.</p>
                  )}
                </div>

                {/* Live quotas (Claude Code etc.) */}
                {selectedQuotas.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium">Current limits</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedQuotas.map((quota) => (
                        <div key={quota.rateLimitType} className="rounded-lg border px-3 py-2">
                          <p className="text-xs text-muted-foreground">
                            {QUOTA_LABELS[quota.rateLimitType] ?? quota.rateLimitType}
                          </p>
                          <p className="text-sm font-medium">
                            {quota.utilization != null ? `${Math.round(quota.utilization * 100)}% used` : quota.status ?? '—'}
                          </p>
                          {formatResetsAt(quota.resetsAt) && (
                            <p className="text-xs text-muted-foreground">{formatResetsAt(quota.resetsAt)}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground">
                  Generated {formatDateTime(summary?.generatedAt ?? null)}
                  {' · '}
                  {selected.accountLabel
                    ? `account: ${selected.accountLabel}`
                    : selected.accountId
                      ? 'connected account'
                      : 'unattributed activity'}
                </p>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}