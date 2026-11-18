import type { UsageSummary } from '@jait/shared'

const number = (value: number) => value.toLocaleString('en-US')

/** Processing totals are distinct from context-window occupancy and subscription quota. */
export function UsageReceipt({ usage }: { usage: UsageSummary }) {
  const knownCache = usage.cachedPromptTokens !== undefined
  const input = usage.promptTokens ?? 0
  return <div data-testid="usage-receipt" className="break-words text-xs text-muted-foreground" aria-label="Model usage">
    {usage.requestCount !== undefined && <span>{number(usage.requestCount)} request{usage.requestCount === 1 ? '' : 's'} · </span>}
    <span>{number(input)} input · </span>
    {knownCache
      ? <span>{number(usage.cachedPromptTokens!)} cached / {number(Math.max(0, input - usage.cachedPromptTokens!))} uncached · </span>
      : <span>cache usage unavailable · </span>}
    <span>{number(usage.completionTokens ?? 0)} output · </span>
    <span>{usage.tokenUsageEstimated ? 'estimated' : 'provider reported'}</span>
  </div>
}
