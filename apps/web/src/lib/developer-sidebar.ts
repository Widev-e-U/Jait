export type DeveloperSidebarView = 'projects' | 'files' | 'git'

export const DEVELOPER_SIDEBAR_MIN_WIDTH = 220
export const DEVELOPER_SIDEBAR_MAX_WIDTH = 480
export const DEVELOPER_SIDEBAR_DEFAULT_WIDTH = 256
export const DEVELOPER_SIDEBAR_WIDTH_STORAGE_KEY = 'developerSidebarWidth'

export interface DeveloperSidebarState {
  open: boolean
  view: DeveloperSidebarView
}

export function getNextDeveloperSidebarState(currentView: DeveloperSidebarView, isOpen: boolean, requestedView: DeveloperSidebarView): DeveloperSidebarState {
  return {
    open: !(isOpen && currentView === requestedView),
    view: requestedView,
  }
}

export function clampDeveloperSidebarWidth(width: number, viewportWidth: number): number {
  const viewportMax = Math.max(DEVELOPER_SIDEBAR_MIN_WIDTH, viewportWidth - 480)
  const maxWidth = Math.min(DEVELOPER_SIDEBAR_MAX_WIDTH, viewportMax)
  return Math.round(Math.min(maxWidth, Math.max(DEVELOPER_SIDEBAR_MIN_WIDTH, width)))
}

export function readDeveloperSidebarWidth(storage: Pick<Storage, 'getItem'>, viewportWidth: number): number {
  const storedWidth = Number.parseInt(storage.getItem(DEVELOPER_SIDEBAR_WIDTH_STORAGE_KEY) ?? '', 10)
  return clampDeveloperSidebarWidth(
    Number.isFinite(storedWidth) ? storedWidth : DEVELOPER_SIDEBAR_DEFAULT_WIDTH,
    viewportWidth,
  )
}

export function storeDeveloperSidebarWidth(storage: Pick<Storage, 'setItem'>, width: number): void {
  storage.setItem(DEVELOPER_SIDEBAR_WIDTH_STORAGE_KEY, String(width))
}
