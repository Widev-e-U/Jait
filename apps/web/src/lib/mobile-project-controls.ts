export type MobileProjectTarget = 'files' | 'git' | 'editor' | 'terminal'

export interface MobileProjectControlState {
  showProject: boolean
  showTerminal: boolean
  showProjectTree: boolean
  showProjectEditor: boolean
  treeTab: 'files' | 'git'
}

export function shouldRenderSessionSidebar(showSidebar: boolean): boolean {
  return showSidebar
}

export function getMobileProjectActiveTarget(
  state: MobileProjectControlState,
): MobileProjectTarget | null {
  if (state.showTerminal) {
    return 'terminal'
  }

  if (!state.showProject) {
    return null
  }

  if (state.showProjectEditor) {
    return 'editor'
  }

  if (state.showProjectTree) {
    return state.treeTab
  }

  return null
}

export function isMobileProjectTargetActive(
  state: MobileProjectControlState,
  target: MobileProjectTarget,
): boolean {
  return getMobileProjectActiveTarget(state) === target
}
