export function getDesktopWorkspacePanelStyle({
  showTree,
  showEditor,
  panelSize,
  treeSize,
  maxCollapsed,
}: {
  showTree: boolean
  showEditor: boolean
  panelSize: number
  treeSize: number
  maxCollapsed?: boolean
}): React.CSSProperties {
  const baseWidth = !showTree && !showEditor ? 0 : !showTree ? Math.max(panelSize - treeSize, 300) : panelSize

  if (maxCollapsed) {
    return {
      width: '100%',
      maxWidth: '100%',
    }
  }

  return {
    width: baseWidth,
    maxWidth: '70vw',
  }
}

export interface WorkspacePaneVisibility {
  tree: boolean
  editor: boolean
}

export function toggleDesktopWorkspaceTreeVisibility(
  layout: WorkspacePaneVisibility,
): WorkspacePaneVisibility {
  const nextTree = !layout.tree

  return {
    tree: nextTree,
    editor: nextTree ? layout.editor : true,
  }
}
