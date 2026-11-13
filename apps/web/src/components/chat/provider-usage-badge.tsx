/**
 * Compact "D 10% W 30%" readout of the selected provider's cached session (5h)
 * and weekly limits. Renders nothing when the provider reports no limits.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { getUsageSummary, refreshUsageSummary, subscribeUsageSummary } from '@/lib/usage-summary-store'
import { cn } from '@/lib/utils'

function percentFor(quotas: Array<{ rateLimitType: string; utilization: number | null }>, type: string): number | null {
  const quota = quotas.find((q) => q.rateLimitType === type && q.utilization != null)
  return quota ? Math.round(Math.min(1, Math.max(0, quota.utilization!)) * 100) : null
}

function tone(percent: number): string {
  return percent >= 90 ? 'text-red-500' : percent >= 75 ? 'text-amber-500' : 'text-emerald-500'
}

export function ProviderUsageBadge({ provider, className }: { provider: string; className?: string }) {
  const summary = useSyncExternalStore(subscribeUsageSummary, getUsageSummary, () => null)
  useEffect(() => { void refreshUsageSummary().catch(() => {}) }, [provider])

  const profile = summary?.profiles.find((p) => p.providerType === provider && p.quotas.length > 0)
  if (!profile) return null
  const daily = percentFor(profile.quotas, 'five_hour')
  const weekly = percentFor(profile.quotas, 'seven_day')
  if (daily == null && weekly == null) return null

  return (
    <div
      className={cn('flex shrink-0 items-center gap-2 text-2xs tabular-nums text-muted-foreground', className)}
      title="Cached provider usage: D = session (5-hour) limit, W = weekly limit"
    >
      {daily != null && <span>D <span className={tone(daily)}>{daily}%</span></span>}
      {weekly != null && <span>W <span className={tone(weekly)}>{weekly}%</span></span>}
    </div>
  )
}
