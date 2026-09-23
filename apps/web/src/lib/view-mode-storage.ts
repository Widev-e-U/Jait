import type { ManagerPage } from '@/lib/app-view'
import type { ViewMode } from '@/components/chat/view-mode-selector'

export const VIEW_MODE_STORAGE_KEY = 'jait.viewMode'

export function readStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'developer'
  const value = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)
  return value === 'manager' ? 'manager' : 'developer'
}

export const MANAGER_PAGE_STORAGE_KEY = 'jait.managerPage'

export function readStoredManagerPage(): ManagerPage {
  if (typeof window === 'undefined') return 'threads'
  return window.localStorage.getItem(MANAGER_PAGE_STORAGE_KEY) === 'agents' ? 'agents' : 'threads'
}

export function storeManagerPage(page: ManagerPage): void {
  window.localStorage.setItem(MANAGER_PAGE_STORAGE_KEY, page)
}
