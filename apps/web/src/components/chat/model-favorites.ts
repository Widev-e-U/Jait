import type { ProviderId } from '@/lib/agents-api'

/** Minimal model shape needed to render favorites (subset of ModelDef). */
export type FavoriteModelDef = {
  id: string
  name: string
}

/**
 * Persisted model favorites: ordered [providerId, modelId] pairs in
 * localStorage under `jait.modelFavorites`.
 */
export type ModelFavorite = {
  provider: ProviderId
  modelId: string
}

const STORAGE_KEY = 'jait.modelFavorites'

function normalizeFavorites(value: unknown): ModelFavorite[] {
  if (!Array.isArray(value)) return []
  const out: ModelFavorite[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const provider = (item as { provider?: unknown }).provider
    const modelId = (item as { modelId?: unknown }).modelId
    if (typeof provider !== 'string' || typeof modelId !== 'string') continue
    const key = `${provider}::${modelId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ provider, modelId })
  }
  return out
}

export function loadModelFavorites(): ModelFavorite[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return normalizeFavorites(JSON.parse(raw))
  } catch {
    return []
  }
}

export function saveModelFavorites(favorites: ModelFavorite[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites))
  } catch {
    // Ignore quota/serialization failures; favorites are a cosmetic hint.
  }
}

export function modelFavoritesKey(provider: ProviderId, modelId: string): string {
  return `${provider}::${modelId}`
}

export function toggleModelFavorite(
  favorites: ModelFavorite[],
  provider: ProviderId,
  modelId: string,
): ModelFavorite[] {
  const key = modelFavoritesKey(provider, modelId)
  const next = favorites.filter((entry) => modelFavoritesKey(entry.provider, entry.modelId) !== key)
  if (next.length !== favorites.length) return next
  return [...favorites, { provider, modelId }]
}

/**
 * Favorites of the *currently selected provider*, in the order they were
 * starred. `available` filters out models the current provider no longer
 * exposes (e.g. removed from the provider's model list).
 */
export function selectFavoriteModels(
  favorites: ModelFavorite[],
  provider: ProviderId,
  available: Map<string, FavoriteModelDef>,
): FavoriteModelDef[] {
  const out: FavoriteModelDef[] = []
  for (const entry of favorites) {
    if (entry.provider !== provider) continue
    const model = available.get(entry.modelId)
    if (model) out.push(model)
  }
  return out
}