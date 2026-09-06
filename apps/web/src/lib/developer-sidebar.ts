export type DeveloperSidebarView = 'projects' | 'files'

export const DEVELOPER_SIDEBAR_MIN_WIDTH = 220
export const DEVELOPER_SIDEBAR_MAX_WIDTH = 480

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
