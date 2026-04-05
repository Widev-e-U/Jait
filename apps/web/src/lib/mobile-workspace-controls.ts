export type MobileWorkspaceTarget = 'files' | 'git' | 'editor' | 'terminal'

export interface MobileWorkspaceControlState {
  showWorkspace: boolean
  showTerminal: boolean
  showWorkspaceTree: boolean
  showWorkspaceEditor: boolean
  treeTab: 'files' | 'git'
}

export function isMobileWorkspaceTargetActive(
  state: MobileWorkspaceControlState,
  target: MobileWorkspaceTarget,
): boolean {
  if (target === 'terminal') {
    return state.showTerminal
  }

  if (!state.showWorkspace || state.showTerminal) {
    return false
  }

  if (target === 'editor') {
    return state.showWorkspaceEditor
  }

  return state.showWorkspaceTree && state.treeTab === target
}
