import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { getApiUrl } from '@/lib/gateway-url'
import { describeResetCredits, describeUsageReset, quotaLabel, type UsageResetCredits } from '@/lib/usage-resets'
import { TooltipHint } from '@/components/ui/tooltip'

const API_URL = getApiUrl()

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface ProviderAccount {
  id: string
  providerType: string
  label: string
}

interface ProviderUsageSnapshot {
  accountId: string
  rateLimitType: string
  providerType: string
  status: string | null
  utilization: number | null
  resetsAt: string | null
  resetSource: string | null
  windowDurationMins: number | null
  /** Unused "reset buttons" the provider granted (Codex's rate limit reset credits). */
  resetCredits?: UsageResetCredits | null
  isUsingOverage: boolean
  updatedAt: string
  accountLabel?: string | null
  quotaRefreshMissing?: boolean
}

const PROVIDER_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  'opencode-go': 'OpenCode Go',
  ollama: 'Ollama',
}

const PROVIDER_HINTS: Record<string, string> = {
  'claude-code': 'Session and weekly subscription limits, reported live by Claude Code during a chat.',
  codex: 'Session and weekly subscription limits, read from the Codex app server when you open or refresh the Usage modal.',
  'opencode-go': 'Rolling, weekly, and monthly limits reported by OpenCode Go.',
  ollama: 'Session, weekly, and monthly quota from your Ollama Cloud server.',
}

function providerLabel(providerType: string): string {
  const known = PROVIDER_LABELS[providerType]
  if (known) return known
  return providerType
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function UsageSettings({ token }: { token: string | null }) {
  const [accounts, setAccounts] = useState<ProviderAccount[]>([])
  const [usage, setUsage] = useState<ProviderUsageSnapshot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const [accountsRes, usageRes] = await Promise.all([
          fetch(`${API_URL}/api/provider-accounts`, { headers: authHeaders(token) }),
          fetch(`${API_URL}/api/provider-usage`, { headers: authHeaders(token) }),
        ])
        const accountsData = accountsRes.ok ? await accountsRes.json() as { accounts?: ProviderAccount[] } : null
        const usageData = usageRes.ok ? await usageRes.json() as { usage?: ProviderUsageSnapshot[] } : null
        if (!cancelled) {
          setAccounts(accountsData?.accounts ?? [])
          setUsage(usageData?.usage ?? [])
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [token])

  if (loading) {
    return (
      <Card className="p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading usage…
      </Card>
    )
  }

  // One card per provider that has an account or a usage row, in first-seen order.
  const providerTypes = [
    ...new Set([...accounts.map((account) => account.providerType), ...usage.map((row) => row.providerType)]),
  ]
  const groups = providerTypes.map((providerType) => ({
    providerType,
    accounts: accounts.filter((account) => account.providerType === providerType),
    rows: usage.filter((row) => row.providerType === providerType),
  }))
  const empty = groups.every((group) => group.accounts.length === 0 && group.rows.length === 0)

  return (
    <div className="space-y-4">
      {empty && (
        <Card className="p-5 text-sm text-muted-foreground">
          No provider accounts or usage reported yet.
        </Card>
      )}
      {groups.map((group) => {
        // Usage rows can belong to a server rather than a saved account (Ollama).
        const orphanRows = group.rows.filter(
          (row) => !group.accounts.some((account) => account.id === row.accountId),
        )
        return (
          <Card key={group.providerType} className="p-5 space-y-4">
            <div>
              <h2 className="text-base font-medium">{providerLabel(group.providerType)}</h2>
              <p className="text-sm text-muted-foreground">
                {PROVIDER_HINTS[group.providerType] ?? 'Subscription limits reported by the provider.'}
              </p>
            </div>
            {group.accounts.length === 0 && orphanRows.length === 0 && (
              <p className="text-sm text-muted-foreground">No accounts configured.</p>
            )}
            {group.accounts.map((account) => {
              const accountRows = group.rows.filter((row) => row.accountId === account.id)
              const resetCredits = describeResetCredits(
                accountRows.find((row) => row.resetCredits)?.resetCredits,
              )
              return (
              <div key={account.id} className="space-y-3">
                <div className="text-sm font-medium">{account.label}</div>
                {resetCredits && (
                  <TooltipHint content={`${resetCredits.title}\nSpend a reset in the provider's app to clear your limits immediately.`}>
                    <p
                      className="text-xs text-emerald-600 dark:text-emerald-400"
                    >
                      ↺ {resetCredits.text}
                    </p>
                  </TooltipHint>
                )}
                {accountRows.length === 0 && (
                  <p className="text-xs text-muted-foreground">No usage reported yet.</p>
                )}
                {accountRows.map((row) => <UsageRow key={row.rateLimitType} row={row} />)}
              </div>
              )
            })}
            {orphanRows.length > 0 && (
              <div className="space-y-3">
                {orphanRows[0].accountLabel && (
                  <div className="text-sm font-medium">{orphanRows[0].accountLabel}</div>
                )}
                {orphanRows.map((row) => <UsageRow key={row.rateLimitType} row={row} />)}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

function UsageRow({ row }: { row: ProviderUsageSnapshot }) {
  const pct = row.utilization !== null ? Math.round(row.utilization * 100) : null
  // A missing refresh channel means the deadline cannot be trusted, like the modal.
  const reset = row.quotaRefreshMissing ? null : describeUsageReset(row.resetsAt, row.resetSource)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{quotaLabel(row.rateLimitType)}</span>
        <span className="tabular-nums text-muted-foreground">
          {pct !== null ? `${pct}% used` : row.status ?? '—'}
          {reset && (
            <TooltipHint content={reset.title}>
              <span>
                {' · '}{reset.text}{reset.estimated ? ' · est.' : ''}
              </span>
            </TooltipHint>
          )}
        </span>
      </div>
      {pct !== null && (
        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}
