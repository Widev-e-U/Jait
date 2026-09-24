import type { ViewMode } from '@/components/chat/view-mode-selector'

export const VIEW_MODE_STORAGE_KEY = 'jait.viewMode'

export function readStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'developer'
  const value = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)
  return value === 'manager' ? 'manager' : 'developer'
}
