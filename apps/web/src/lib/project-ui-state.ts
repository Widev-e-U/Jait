import type { ProjectUIState } from '@jait/shared'

export function getProjectUiRestoreKey(projectId: string, ui: ProjectUIState) {
  const panel = ui.panel
    ? {
        open: ui.panel.open,
        remotePath: ui.panel.remotePath,
        nodeId: ui.panel.nodeId,
      }
    : null
  return JSON.stringify({
    projectId,
    panel,
    tabs: ui.tabs,
    layout: ui.layout,
    terminal: ui.terminal,
    preview: ui.preview,
  })
}

export function areProjectUiValuesEqual(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * Merge a partial layout update into the persisted project layout without
 * dropping fields the caller did not provide.
 *
 * - Visibility-only updates ({ tree, editor }) keep the persisted
 *   panelSize/treeSize.
 * - Size-only updates ({ panelSize, treeSize }) keep the current
 *   tree/editor visibility.
 * - When there is no existing layout, tree/editor default to `true` (the
 *   app's default for a project that has never been opened).
 */
export function mergeProjectLayout(
  existing: ProjectUIState['layout'],
  next: { tree?: boolean; editor?: boolean; panelSize?: number; treeSize?: number },
): ProjectUIState['layout'] {
  return {
    tree: next.tree ?? existing?.tree ?? true,
    editor: next.editor ?? existing?.editor ?? true,
    panelSize: next.panelSize ?? existing?.panelSize,
    treeSize: next.treeSize ?? existing?.treeSize,
  }
}

export function getPersistablePreviewTarget(target?: string | null): string | null {
  const trimmed = target?.trim() || ''
  return trimmed && trimmed !== '__preview__' ? trimmed : null
}
