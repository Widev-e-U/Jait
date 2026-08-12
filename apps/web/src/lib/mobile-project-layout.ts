export interface ProjectLayoutState {
  tree: boolean
  editor: boolean
}

export type MobileProjectReopenTarget = 'background' | 'editor'

export function normalizeHydratedProjectLayout(
  layout: ProjectLayoutState,
  isMobile: boolean,
): ProjectLayoutState {
  if (!isMobile) {
    // Desktop: respect the saved layout as-is. A fully collapsed layout
    // ({ tree: false, editor: false }) is an explicit user choice and must
    // stay collapsed — never force the editor open here. Projects with no
    // saved layout never reach this function (applyProjectUI leaves the
    // tree/editor defaults untouched), so there is no fallback to invent.
    return layout
  }

  if (layout.tree) return { tree: true, editor: false }
  if (layout.editor) return showMobileProjectPane('editor')
  return collapseMobileProject()
}

export function collapseMobileProject(): ProjectLayoutState {
  return { tree: false, editor: false }
}

export function showMobileProjectPane(pane: 'tree' | 'editor'): ProjectLayoutState {
  return pane === 'tree'
    ? { tree: true, editor: false }
    : { tree: false, editor: true }
}

export function getReopenedMobileProjectLayout(
  target: MobileProjectReopenTarget = 'background',
): ProjectLayoutState {
  return target === 'editor'
    ? showMobileProjectPane('editor')
    : collapseMobileProject()
}

export function toggleMobileProjectPane(
  layout: ProjectLayoutState,
  pane: 'tree' | 'editor',
): ProjectLayoutState {
  const targetActive = pane === 'tree' ? layout.tree : layout.editor
  const otherActive = pane === 'tree' ? layout.editor : layout.tree

  if (targetActive && !otherActive) {
    return collapseMobileProject()
  }

  return showMobileProjectPane(pane)
}
