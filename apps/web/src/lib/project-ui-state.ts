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

export function getPersistablePreviewTarget(target?: string | null): string | null {
  const trimmed = target?.trim() || ''
  return trimmed && trimmed !== '__preview__' ? trimmed : null
}
