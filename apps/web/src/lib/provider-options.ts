export interface ProviderOptionSource {
  id: string
}

export interface RemoteProviderOptionSource {
  providers: string[]
}

export function getMissingRemoteProviderIds(
  localProviders: ProviderOptionSource[],
  remoteProviders: RemoteProviderOptionSource[],
): string[] {
  const known = new Set(localProviders.map((provider) => provider.id))
  const missing: string[] = []
  for (const remote of remoteProviders) {
    for (const providerId of remote.providers) {
      if (!providerId || known.has(providerId)) continue
      known.add(providerId)
      missing.push(providerId)
    }
  }
  return missing
}
