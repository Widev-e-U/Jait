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

/** Sentinel values used by the drag-resize hook for snap states. */
export const DRAG_SNAP_MIN = -1
export const DRAG_SNAP_MAX = -2

export function resolvePersistedResizeSize(
  persistedSize: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, persistedSize))
}

/**
 * Resolve the size to report to the parent when a drag ends.
 *
 * Returns `null` when there is nothing meaningful to persist: no drag
 * happened, or the pane snapped collapsed to width 0 (the parent closes the
 * panel in that case, and 0 is not a usable persisted width). This is the
 * only point at which sizes are reported — never mid-drag — so the parent
 * can persist per-project widths without re-rendering on every pointer move.
 */
export function resolveDragEndSize(
  pendingSize: number | null,
  snapMaxSize: number,
): number | null {
  if (pendingSize === null) return null
  if (pendingSize === DRAG_SNAP_MIN) return null
  if (pendingSize === DRAG_SNAP_MAX) return snapMaxSize
  return pendingSize
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
