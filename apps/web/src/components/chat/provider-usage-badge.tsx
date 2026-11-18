/** Compact selected-account subscription usage for the chat panel footer. */
import { useSyncExternalStore, useEffect, useState } from 'react'
import { decodeJaitModelId } from '@jait/shared'
import { UsageModal, type UsageSummary } from '@/components/app-shell/usage-modal'
import { TooltipHint } from '@/components/ui/tooltip'
import { getUsageSummary, refreshUsageSummary, subscribeUsageSummary } from '@/lib/usage-summary-store'

export function findUsageProfile(summary: UsageSummary | null, provider: string, model?: string | null) {
  const profiles = summary?.profiles ?? []
  if (provider === 'jait') {
    const backend = model && decodeJaitModelId(model)
    if (!backend) return undefined
    const matching = profiles.filter((profile) => profile.id.startsWith('jait-backend:')
      && profile.id.endsWith(`:${backend.instanceId}`) && profile.providerType === backend.backend)
    return matching.length === 1 ? matching[0] : undefined
  }
  // The selector normally holds an account ID. Never substitute a different
  // account's limits when an exact match has no quota data.
  const exact = profiles.find((profile) => profile.id === provider)
  if (exact) return exact
  // Older selections can contain only a provider type. That is safe only when
  // there is one account of that type.
  const matching = profiles.filter((profile) => profile.providerType === provider)
  return matching.length === 1 ? matching[0] : undefined
}

function percentFor(quotas: Array<{ rateLimitType: string; utilization: number | null }>, type: string): number | null {
  const quota = quotas.find((q) => q.rateLimitType === type && q.utilization != null)
  return quota ? Math.round(Math.min(1, Math.max(0, quota.utilization!)) * 100) : null
}

function tone(percent: number): string {
  return percent >= 90 ? 'text-red-500' : percent >= 75 ? 'text-amber-500' : 'text-emerald-500'
}

export function ProviderUsageBadge({ provider, model }: { provider: string; model?: string | null }) {
  const summary = useSyncExternalStore(subscribeUsageSummary, getUsageSummary, () => null)
  useEffect(() => { if (provider) void refreshUsageSummary().catch(() => {}) }, [provider])
  const [modalOpen, setModalOpen] = useState(false)
  const profile = findUsageProfile(summary, provider, model)
  const daily = percentFor(profile?.quotas ?? [], 'five_hour')
  const weekly = percentFor(profile?.quotas ?? [], 'seven_day')
  // Ollama accounts on a balance plan report only a monthly allowance.
  const monthly = percentFor(profile?.quotas ?? [], 'monthly')
  if (daily == null && weekly == null && monthly == null) return null

  return (
    <>
      <TooltipHint content="Cached provider usage: D = session (5-hour) limit, W = weekly limit, M = monthly limit. Click for details" side="top">
        <button
          type="button"
          aria-label={`Provider usage: ${daily == null ? '' : `session ${daily}%`} ${weekly == null ? '' : `weekly ${weekly}%`} ${monthly == null ? '' : `monthly ${monthly}%`}`.trim()}
          onClick={() => setModalOpen(true)}
          className="flex w-fit shrink-0 cursor-pointer items-center gap-2 text-2xs tabular-nums text-muted-foreground hover:text-foreground"
        >
          {daily != null && <span>D <span className={tone(daily)}>{daily}%</span></span>}
          {weekly != null && <span>W <span className={tone(weekly)}>{weekly}%</span></span>}
          {monthly != null && <span>M <span className={tone(monthly)}>{monthly}%</span></span>}
        </button>
      </TooltipHint>
      <UsageModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  )
}
