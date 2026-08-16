export interface SavedProjectPanelState {
  open?: boolean
}

export interface SavedProjectLayoutState {
  tree?: boolean
  editor?: boolean
  panelSize?: number
  treeSize?: number
  terminalHeight?: number
  terminalColumnWidth?: number
}

export function resolveProjectPanelOpen(
  explicitOpen: boolean | undefined,
  savedPanel: SavedProjectPanelState | null | undefined,
): boolean {
  if (typeof explicitOpen === 'boolean') return explicitOpen
  if (typeof savedPanel?.open === 'boolean') return savedPanel.open
  // No saved preference: do NOT open the panel by default. Editor mode is
  // opt-in — a project that never had editor mode explicitly enabled must not
  // auto-open its editor panel.
  return false
}

export function mergeSavedProjectLayout(
  existing: SavedProjectLayoutState | null | undefined,
  update: unknown,
): SavedProjectLayoutState | null {
  if (update === null) return null
  if (update === undefined || typeof update !== 'object' || Array.isArray(update)) return existing ?? null
  return {
    ...existing,
    ...(update as SavedProjectLayoutState),
  }
}
