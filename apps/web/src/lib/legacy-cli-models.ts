import type { ProviderId } from '@/lib/agents-api'

export function loadLegacyCliModelsByProvider(currentProvider: ProviderId): Partial<Record<ProviderId, string | null>> {
  const models: Partial<Record<ProviderId, string | null>> = {}

  try {
    const raw = localStorage.getItem('cliModelsByProvider')
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      for (const providerId of ['jait', 'codex', 'claude-code'] as const) {
        const value = parsed[providerId]
        if (typeof value === 'string' && value.trim()) {
          models[providerId] = value
        }
      }
    }
  } catch {
    // Ignore invalid persisted data and fall back to an empty map.
  }

  const legacyModel = localStorage.getItem('cliModel')
  if (legacyModel && !models[currentProvider]) {
    models[currentProvider] = legacyModel
  }

  return models
}
