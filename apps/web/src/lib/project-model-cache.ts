export type ProjectModelSelections = Partial<Record<string, string | null>>
export type ProjectReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'

const PROJECT_MODEL_CACHE_PREFIX = 'jait:project-models:v1:'
const PROJECT_PROVIDER_CACHE_PREFIX = 'jait:project-provider:v1:'
const PROJECT_REASONING_EFFORT_CACHE_PREFIX = 'jait:project-reasoning-effort:v1:'

function projectModelCacheKey(projectId: string): string {
  return `${PROJECT_MODEL_CACHE_PREFIX}${projectId}`
}

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage
  if (typeof window === 'undefined') return null
  return window.localStorage
}

export function readProjectModelSelections(
  projectId: string | null | undefined,
  storage?: Storage,
): ProjectModelSelections | null {
  if (!projectId) return null
  const target = resolveStorage(storage)
  if (!target) return null
  try {
    const raw = target.getItem(projectModelCacheKey(projectId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const selections: ProjectModelSelections = {}
    for (const [provider, value] of Object.entries(parsed)) {
      if (provider && typeof value === 'string' && value.trim()) selections[provider] = value
    }
    return Object.keys(selections).length > 0 ? selections : null
  } catch {
    return null
  }
}

export function writeProjectModelSelections(
  projectId: string | null | undefined,
  selections: ProjectModelSelections,
  storage?: Storage,
): void {
  if (!projectId) return
  const target = resolveStorage(storage)
  if (!target) return
  const normalized: ProjectModelSelections = {}
  for (const [provider, value] of Object.entries(selections)) {
    if (provider && typeof value === 'string' && value.trim()) normalized[provider] = value
  }
  try {
    if (Object.keys(normalized).length === 0) {
      target.removeItem(projectModelCacheKey(projectId))
    } else {
      target.setItem(projectModelCacheKey(projectId), JSON.stringify(normalized))
    }
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

export function saveProjectModelSelection(
  projectId: string | null | undefined,
  provider: string,
  model: string | null,
  storage?: Storage,
): void {
  if (!projectId) return
  const selections = readProjectModelSelections(projectId, storage) ?? {}
  if (typeof model === 'string' && model.trim()) {
    selections[provider] = model
  } else {
    delete selections[provider]
  }
  writeProjectModelSelections(projectId, selections, storage)
}

function projectProviderCacheKey(projectId: string): string {
  return `${PROJECT_PROVIDER_CACHE_PREFIX}${projectId}`
}

export function readProjectProviderSelection(
  projectId: string | null | undefined,
  storage?: Storage,
): string | null {
  if (!projectId) return null
  const target = resolveStorage(storage)
  if (!target) return null
  try {
    const provider = target.getItem(projectProviderCacheKey(projectId))?.trim()
    return provider || null
  } catch {
    return null
  }
}

export function saveProjectProviderSelection(
  projectId: string | null | undefined,
  provider: string,
  storage?: Storage,
): void {
  if (!projectId || !provider.trim()) return
  const target = resolveStorage(storage)
  if (!target) return
  try {
    target.setItem(projectProviderCacheKey(projectId), provider)
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function projectReasoningEffortCacheKey(projectId: string): string {
  return `${PROJECT_REASONING_EFFORT_CACHE_PREFIX}${projectId}`
}

export function readProjectReasoningEffortSelection(
  projectId: string | null | undefined,
  provider: string,
  storage?: Storage,
): ProjectReasoningEffort | null | undefined {
  if (!projectId || !provider.trim()) return undefined
  const target = resolveStorage(storage)
  if (!target) return undefined
  try {
    const raw = target.getItem(projectReasoningEffortCacheKey(projectId))
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const value = parsed[provider]
    if (value === null) return null
    return value === 'minimal' || value === 'low' || value === 'medium' || value === 'high'
      ? value
      : undefined
  } catch {
    return undefined
  }
}

export function saveProjectReasoningEffortSelection(
  projectId: string | null | undefined,
  provider: string,
  reasoningEffort: ProjectReasoningEffort | null,
  storage?: Storage,
): void {
  if (!projectId || !provider.trim()) return
  const target = resolveStorage(storage)
  if (!target) return
  try {
    const raw = target.getItem(projectReasoningEffortCacheKey(projectId))
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {}
    parsed[provider] = reasoningEffort
    target.setItem(projectReasoningEffortCacheKey(projectId), JSON.stringify(parsed))
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}
