export function getDesktopWorkspacePanelStyle({
  showTree,
  showEditor,
  panelSize,
  treeSize,
}: {
  showTree: boolean
  showEditor: boolean
  panelSize: number
  treeSize: number
}) {
  return {
    width: !showTree && !showEditor ? 0 : !showTree ? Math.max(panelSize - treeSize, 300) : !showEditor ? treeSize + 8 : panelSize,
    maxWidth: '70vw' as const,
  }
}
