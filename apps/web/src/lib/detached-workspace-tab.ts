export type DetachedWorkspaceTabType = 'file' | 'diff' | 'preview' | 'architecture'

export interface DetachedWorkspaceTabPayload {
  id: string
  title: string
  theme: 'light' | 'dark'
  surfaceId?: string | null
  tab: {
    id: string
    type: DetachedWorkspaceTabType
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

const STORAGE_PREFIX = 'jait:detached-workspace-tab:'

function getStorageKey(id: string): string {
  return `${STORAGE_PREFIX}${id}`
}

export function saveDetachedWorkspaceTab(payload: DetachedWorkspaceTabPayload): void {
  try {
    localStorage.setItem(getStorageKey(payload.id), JSON.stringify(payload))
  } catch {
    // Ignore blocked or full storage and keep the current tab usable.
  }
}

export function loadDetachedWorkspaceTab(id: string): DetachedWorkspaceTabPayload | null {
  const storageKey = getStorageKey(id)
  let raw: string | null = null
  try {
    raw = localStorage.getItem(storageKey)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    return JSON.parse(raw) as DetachedWorkspaceTabPayload
  } catch {
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // Ignore storage cleanup failures.
    }
    return null
  }
}

export function clearDetachedWorkspaceTab(id: string): void {
  try {
    localStorage.removeItem(getStorageKey(id))
  } catch {
    // Ignore blocked storage and continue closing the tab view.
  }
}
