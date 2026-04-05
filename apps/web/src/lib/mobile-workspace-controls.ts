export type MobileWorkspaceTarget = 'files' | 'git' | 'editor' | 'terminal'

export interface MobileWorkspaceControlState {
  showWorkspace: boolean
  showTerminal: boolean
  showWorkspaceTree: boolean
  showWorkspaceEditor: boolean
  treeTab: 'files' | 'git'
}

export function getMobileWorkspaceActiveTarget(
  state: MobileWorkspaceControlState,
): MobileWorkspaceTarget | null {
  if (state.showTerminal) {
    return 'terminal'
  }

  if (!state.showWorkspace) {
    return null
  }

  if (state.showWorkspaceEditor) {
    return 'editor'
  }

  if (state.showWorkspaceTree) {
    return state.treeTab
  }

  return null
}

export function isMobileWorkspaceTargetActive(
  state: MobileWorkspaceControlState,
  target: MobileWorkspaceTarget,
): boolean {
  return getMobileWorkspaceActiveTarget(state) === target
}
