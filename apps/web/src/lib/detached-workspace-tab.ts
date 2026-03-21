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
  localStorage.setItem(getStorageKey(payload.id), JSON.stringify(payload))
}

export function loadDetachedWorkspaceTab(id: string): DetachedWorkspaceTabPayload | null {
  const raw = localStorage.getItem(getStorageKey(id))
  if (!raw) return null
  try {
    return JSON.parse(raw) as DetachedWorkspaceTabPayload
  } catch {
    return null
  }
}

export function clearDetachedWorkspaceTab(id: string): void {
  localStorage.removeItem(getStorageKey(id))
}
