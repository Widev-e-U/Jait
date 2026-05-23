export function getDesktopProjectPanelStyle({
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
  const baseWidth = !showTree && !showEditor
    ? 0
    : !showTree
      ? Math.max(panelSize - treeSize, 300)
      : !showEditor
        ? treeSize
        : panelSize

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

export interface ProjectPaneVisibility {
  tree: boolean
  editor: boolean
}

export function toggleDesktopProjectTreeVisibility(
  layout: ProjectPaneVisibility,
): ProjectPaneVisibility {
  const nextTree = !layout.tree

  return {
    tree: nextTree,
    editor: nextTree ? layout.editor : true,
  }
}
