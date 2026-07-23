import type { ProviderId, ProviderInfo, RemoteProviderInfo } from './agents-api'

export interface ProviderSourceOptions {
  localProviders: ProviderInfo[]
  remoteNode?: RemoteProviderInfo
  remoteProviderIds?: ProviderId[]
  scopedToRemoteNode: boolean
}

const REMOTE_PROVIDER_NAMES: Record<string, string> = {
  codex: 'Codex',
  'claude-code': 'Claude Code',
}

function gatewayJaitProvider(localProviders: ProviderInfo[]): ProviderInfo {
  return localProviders.find((provider) => provider.id === 'jait') ?? {
    id: 'jait',
    name: 'Jait',
    description: 'Native Jait agent loop with full tool access',
    available: true,
    modes: ['full-access', 'supervised'],
  }
}

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

export function getScopedProviderSource({
  localProviders,
  remoteNode,
  remoteProviderIds = [],
  scopedToRemoteNode,
}: ProviderSourceOptions): ProviderInfo[] {
  if (!scopedToRemoteNode) return localProviders

  const statusById = new Map(
    (remoteNode?.providerStatuses ?? []).map((status) => [status.id, status]),
  )
  const providerIds = new Set<ProviderId>([
    ...(remoteNode?.providers ?? []),
    ...remoteProviderIds,
    ...statusById.keys(),
  ])

  const remoteProviders = [...providerIds]
    .filter((providerId) => providerId !== 'jait')
    .map((providerId): ProviderInfo => {
      const status = statusById.get(providerId)
      const installed = status?.installed ?? true
      const authenticated = status?.authenticated ?? null
      const advertised = remoteNode?.providers.includes(providerId) ?? remoteProviderIds.includes(providerId)
      const available = installed && authenticated !== false && advertised
      const unavailableReason = !installed
        ? 'Not installed on this device'
        : authenticated === false
          ? 'Login required on this device'
          : !advertised
            ? 'Not available on this device'
            : undefined

      return {
        id: providerId,
        providerType: status?.providerType ?? providerId,
        name: status?.name ?? REMOTE_PROVIDER_NAMES[status?.providerType ?? providerId] ?? providerId,
        description: status?.detail ?? `Runs on ${remoteNode?.nodeName ?? 'the selected device'}`,
        available,
        ...(unavailableReason ? { unavailableReason } : {}),
        modes: ['full-access', 'supervised'],
        auth: {
          login: true,
          logout: authenticated === true,
          deviceCode: true,
          authenticated,
          detail: status?.detail,
        },
      }
    })

  return [gatewayJaitProvider(localProviders), ...remoteProviders]
}
