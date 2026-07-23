export type ProjectModelSelections = Partial<Record<string, string | null>>

const PROJECT_MODEL_CACHE_PREFIX = 'jait:project-models:v1:'

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
