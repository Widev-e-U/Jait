import type { UsageSummary } from '@jait/shared'

const number = (value: number) => value.toLocaleString('en-US')

/** Processing totals are distinct from context-window occupancy and subscription quota. */
export function UsageReceipt({ usage }: { usage: UsageSummary }) {
  const input = usage.promptTokens
  const cached = usage.cachedPromptTokens
  const written = usage.cacheWriteTokens
  const ordinary = input !== undefined && cached !== undefined && written !== undefined
    ? Math.max(0, input - cached - written) : undefined
  return <div data-testid="usage-receipt" className="break-words text-xs text-muted-foreground" aria-label="Model usage">
    {usage.requestCount !== undefined && <span>{number(usage.requestCount)} request{usage.requestCount === 1 ? '' : 's'} · </span>}
    <span>{input === undefined ? 'input unavailable' : `${number(input)} input`} · </span>
    <span>{cached === undefined ? 'cache reads unavailable' : `${number(cached)} cache reads`} · </span>
    <span>{written === undefined ? 'cache writes unavailable' : `${number(written)} cache writes`} · </span>
    {ordinary !== undefined && <span>{number(ordinary)} other input · </span>}
    <span>{usage.completionTokens === undefined ? 'output unavailable' : `${number(usage.completionTokens)} output`} · </span>
    <span>{usage.tokenUsageEstimated ? 'estimated tokens' : input !== undefined || usage.completionTokens !== undefined ? 'provider-reported tokens' : 'token counts unavailable'}</span>
    {usage.cost && <span> · {usage.cost.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} {usage.cost.currency} estimated from configured rates</span>}
  </div>
}
