import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { getApiUrl } from '@/lib/gateway-url'

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
  isUsingOverage: boolean
  updatedAt: string
}

const RATE_LIMIT_LABELS: Record<string, string> = {
  five_hour: 'Session limit',
  seven_day: 'Weekly limit',
  seven_day_opus: 'Opus weekly limit',
  seven_day_sonnet: 'Sonnet weekly limit',
  overage: 'Extra usage',
}

function formatResetsAt(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return `Resets ${date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
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

  const claudeAccounts = accounts.filter((account) => account.providerType === 'claude-code')
  const codexAccounts = accounts.filter((account) => account.providerType === 'codex')

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div>
          <h2 className="text-base font-medium">Claude Code</h2>
          <p className="text-sm text-muted-foreground">
            Session and weekly subscription limits, reported live by Claude Code during a chat.
          </p>
        </div>
        {claudeAccounts.length === 0 && (
          <p className="text-sm text-muted-foreground">No Claude Code accounts configured.</p>
        )}
        {claudeAccounts.map((account) => {
          const rows = usage.filter((row) => row.accountId === account.id)
          return (
            <div key={account.id} className="space-y-3">
              <div className="text-sm font-medium">{account.label}</div>
              {rows.length === 0 && (
                <p className="text-xs text-muted-foreground">No usage reported yet — send a message in a Claude Code chat to populate this.</p>
              )}
              {rows.map((row) => {
                const pct = row.utilization !== null ? Math.round(row.utilization * 100) : null
                const resetText = formatResetsAt(row.resetsAt)
                return (
                  <div key={row.rateLimitType} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{RATE_LIMIT_LABELS[row.rateLimitType] ?? row.rateLimitType}</span>
                      <span className="tabular-nums text-muted-foreground">{pct !== null ? `${pct}% used` : row.status ?? '—'}{resetText ? ` · ${resetText}` : ''}</span>
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
              })}
            </div>
          )
        })}
      </Card>

      <Card className="p-5 space-y-2">
        <div>
          <h2 className="text-base font-medium">Codex</h2>
          <p className="text-sm text-muted-foreground">
            Codex doesn't push rate-limit updates the way Claude Code does — the only way to check
            is running <code className="text-xs bg-muted px-1 py-0.5 rounded">/status</code> in a
            Codex chat, which costs a real turn. {codexAccounts.length > 0 ? 'Check there for now.' : 'No Codex accounts configured.'}
          </p>
        </div>
      </Card>
    </div>
  )
}
