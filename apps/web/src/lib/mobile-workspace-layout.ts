export interface WorkspaceLayoutState {
  tree: boolean
  editor: boolean
}

export type MobileWorkspaceReopenTarget = 'background' | 'editor'

export function normalizeHydratedWorkspaceLayout(
  layout: WorkspaceLayoutState,
  isMobile: boolean,
): WorkspaceLayoutState {
  if (!isMobile) {
    return !layout.tree && !layout.editor
      ? { tree: false, editor: true }
      : layout
  }

  if (layout.tree) return { tree: true, editor: false }
  if (layout.editor) return showMobileWorkspacePane('editor')
  return collapseMobileWorkspace()
}

export function collapseMobileWorkspace(): WorkspaceLayoutState {
  return { tree: false, editor: false }
}

export function showMobileWorkspacePane(pane: 'tree' | 'editor'): WorkspaceLayoutState {
  return pane === 'tree'
    ? { tree: true, editor: false }
    : { tree: false, editor: true }
}

export function getReopenedMobileWorkspaceLayout(
  target: MobileWorkspaceReopenTarget = 'background',
): WorkspaceLayoutState {
  return target === 'editor'
    ? showMobileWorkspacePane('editor')
    : collapseMobileWorkspace()
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
