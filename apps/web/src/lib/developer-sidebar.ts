export type DeveloperSidebarView = 'projects' | 'chats'

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
