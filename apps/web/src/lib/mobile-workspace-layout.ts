export interface WorkspaceLayoutState {
  tree: boolean
  editor: boolean
}

export function collapseMobileWorkspace(): WorkspaceLayoutState {
  return { tree: false, editor: false }
}

export function showMobileWorkspacePane(pane: 'tree' | 'editor'): WorkspaceLayoutState {
  return pane === 'tree'
    ? { tree: true, editor: false }
    : { tree: false, editor: true }
}

export function toggleMobileWorkspacePane(
  layout: WorkspaceLayoutState,
  pane: 'tree' | 'editor',
): WorkspaceLayoutState {
  const targetActive = pane === 'tree' ? layout.tree : layout.editor
  const otherActive = pane === 'tree' ? layout.editor : layout.tree

  if (targetActive && !otherActive) {
    return collapseMobileWorkspace()
  }

  return showMobileWorkspacePane(pane)
}
