/**
 * Provider scoping — one rule, used by every provider picker.
 *
 * Every provider runs on exactly one device, reported by the gateway as
 * `nodeId`/`nodeName`. Scoping is therefore a single filter:
 *
 *  - Working on the gateway (no project device, or the project lives on the
 *    gateway): show only gateway-hosted providers. A project running on the
 *    gateway can never route a turn to another device's provider, so that
 *    device's entries would be selectable but non-functional.
 *  - Working inside a project pinned to a device: show only that device's
 *    providers, plus Jait, which always runs on the gateway and is the
 *    guaranteed fallback.
 *
 * Availability is taken from the gateway snapshot rather than re-derived from
 * node capability lists — those list provider *types* ("codex") while accounts
 * are identified by account id ("codex-01J…"), and mixing the two made a
 * provider look unavailable depending on which message arrived last.
 */

import type { ProviderId, ProviderInfo } from './agents-api'

export const GATEWAY_NODE_ID = 'gateway'
export const GATEWAY_NODE_LABEL = 'Gateway'

export interface ScopedProviderEntry extends ProviderInfo {
  nodeId: string
  nodeName: string
  /** Whether the provider can be selected right now. */
  isAvailable: boolean
  /** Why it cannot be selected, when `isAvailable` is false. */
  reason?: string
}

export interface ScopeProvidersOptions {
  providers: ProviderInfo[]
  /** Device the current project/repo is pinned to; `gateway`/null means unscoped. */
  scopeNodeId?: string | null
  /** Devices currently connected to the gateway. */
  connectedNodeIds?: string[]
  /** Provider accounts the selected repository node reports as runnable. */
  availableProviderIds?: ProviderId[]
  /** Display name for the scope device when it is not connected. */
  scopeNodeLabel?: string | null
  /** Provider snapshot has not arrived yet — availability is still unknown. */
  loading?: boolean
}

export interface ScopedProviders {
  entries: ScopedProviderEntry[]
  /** True when scoped to a device that is not currently connected. */
  scopeNodeOffline: boolean
  /** Label of the device the list is scoped to, if any. */
  scopeNodeLabel?: string
}

const FALLBACK_JAIT: ProviderInfo = {
  id: 'jait',
  name: 'Jait',
  description: 'Native Jait agent loop with full tool access',
  available: true,
  modes: ['full-access', 'supervised'],
  nodeId: GATEWAY_NODE_ID,
  nodeName: GATEWAY_NODE_LABEL,
}

function withNode(provider: ProviderInfo): ProviderInfo & { nodeId: string; nodeName: string } {
  const nodeId = provider.nodeId ?? GATEWAY_NODE_ID
  return {
    ...provider,
    nodeId,
    nodeName: provider.nodeName ?? (nodeId === GATEWAY_NODE_ID ? GATEWAY_NODE_LABEL : nodeId),
  }
}

/** Jait always runs on the gateway, so it is available from any project. */
function isGatewayNativeProvider(provider: ProviderInfo): boolean {
  return provider.id === 'jait'
}

function inferAdvertisedProviderType(providerId: ProviderId): string {
  const providerTypes = ['claude-code', 'pi-gemini', 'deepagents', 'codex', 'cursor', 'pi']
  return providerTypes.find((providerType) =>
    providerId === providerType || providerId.startsWith(`${providerType}-`),
  ) ?? providerId
}

export function scopeProviders({
  providers,
  scopeNodeId,
  connectedNodeIds = [],
  availableProviderIds = [],
  scopeNodeLabel,
  loading = false,
}: ScopeProvidersOptions): ScopedProviders {
  const source = providers.length > 0 ? providers : [FALLBACK_JAIT]
  const baseProviders = source.map(withNode)

  const scope = scopeNodeId && scopeNodeId !== GATEWAY_NODE_ID ? scopeNodeId : null
  const scopeNodeOffline = Boolean(scope) && !connectedNodeIds.includes(scope!)
  const advertisedProviderIds = new Set(availableProviderIds)
  const resolvedScopeLabel = scope
    ? baseProviders.find((provider) => provider.nodeId === scope)?.nodeName ?? scopeNodeLabel ?? scope
    : undefined
  const knownProviderIds = new Set(baseProviders.map((provider) => provider.id))
  const advertisedProviders = scope
    ? availableProviderIds
        .filter((providerId) => providerId !== 'jait' && !knownProviderIds.has(providerId))
        .map((providerId): ProviderInfo & { nodeId: string; nodeName: string } => ({
          id: providerId,
          providerType: inferAdvertisedProviderType(providerId),
          name: providerId,
          description: `Runs on ${resolvedScopeLabel ?? scope}`,
          available: true,
          modes: ['full-access', 'supervised'],
          nodeId: scope,
          nodeName: resolvedScopeLabel ?? scope,
        }))
    : []
  const annotated = [...baseProviders, ...advertisedProviders]

  const visible = scope
    ? annotated
        .filter((provider) =>
          provider.nodeId === scope
          || isGatewayNativeProvider(provider)
          || advertisedProviderIds.has(provider.id),
        )
        .map((provider) =>
          advertisedProviderIds.has(provider.id) && !isGatewayNativeProvider(provider)
            ? { ...provider, nodeId: scope, nodeName: resolvedScopeLabel ?? scope }
            : provider,
        )
    : annotated.filter((provider) => provider.nodeId === GATEWAY_NODE_ID)

  const entries = visible.map((provider): ScopedProviderEntry => {
    if (isGatewayNativeProvider(provider)) {
      return { ...provider, isAvailable: true }
    }
    if (scope && scopeNodeOffline) {
      return {
        ...provider,
        isAvailable: false,
        reason: `${resolvedScopeLabel ?? 'This device'} is offline`,
      }
    }
    if (loading && !provider.available) {
      return { ...provider, isAvailable: false, reason: 'Checking device…' }
    }
    return {
      ...provider,
      isAvailable: provider.available,
      reason: provider.available ? undefined : provider.unavailableReason ?? 'Unavailable',
    }
  })

  return {
    entries,
    scopeNodeOffline,
    ...(resolvedScopeLabel ? { scopeNodeLabel: resolvedScopeLabel } : {}),
  }
}

/**
 * Keep the selected provider when it is still usable in the current scope,
 * otherwise fall back to Jait. `preferredProviderId` restores the user's
 * original choice once it becomes available again (e.g. back on the device
 * that hosts it).
 */
export function resolveScopedProviderSelection(
  selectedProviderId: ProviderId,
  providers: Array<{ value: ProviderId; isAvailable: boolean }>,
  preferredProviderId?: ProviderId,
): ProviderId {
  if (preferredProviderId) {
    const preferredProvider = providers.find((provider) => provider.value === preferredProviderId)
    if (preferredProvider?.isAvailable) return preferredProviderId
  }
  if (selectedProviderId === 'jait') return selectedProviderId
  const selectedProvider = providers.find((provider) => provider.value === selectedProviderId)
  return selectedProvider?.isAvailable ? selectedProviderId : 'jait'
}
