export type DetachedProjectTabType = 'file' | 'diff' | 'preview' | 'architecture'

export interface DetachedProjectTabPayload {
  id: string
  title: string
  theme: 'light' | 'dark'
  surfaceId?: string | null
  tab: {
    id: string
    type: DetachedProjectTabType
    path: string
    label: string
    language?: string
    content?: string | null
    originalContent?: string | null
    modifiedContent?: string | null
    diffMode?: 'git' | 'review'
    previewTarget?: string
    previewSrc?: string | null
    previewMode?: 'raw' | 'managed' | null
  }
  architectureDiagram?: string | null
  architectureGenerating?: boolean
  createdAt: number
}

const STORAGE_PREFIX = 'jait:detached-project-tab:'

function getStorageKey(id: string): string {
  return `${STORAGE_PREFIX}${id}`
}

export function saveDetachedProjectTab(payload: DetachedProjectTabPayload): void {
  try {
    localStorage.setItem(getStorageKey(payload.id), JSON.stringify(payload))
  } catch {
    // Ignore blocked or full storage and keep the current tab usable.
  }
}

export function loadDetachedProjectTab(id: string): DetachedProjectTabPayload | null {
  const storageKey = getStorageKey(id)
  let raw: string | null = null
  try {
    raw = localStorage.getItem(storageKey)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    return JSON.parse(raw) as DetachedProjectTabPayload
  } catch {
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // Ignore storage cleanup failures.
    }
    return null
  }
}

export function clearDetachedProjectTab(id: string): void {
  try {
    localStorage.removeItem(getStorageKey(id))
  } catch {
    // Ignore blocked storage and continue closing the tab view.
  }
}
