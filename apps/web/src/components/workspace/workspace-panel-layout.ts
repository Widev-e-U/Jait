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
  const baseWidth = !showTree && !showEditor ? 0 : !showTree ? Math.max(panelSize - treeSize, 300) : !showEditor ? treeSize : panelSize

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
