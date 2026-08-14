export interface SavedProjectPanelState {
  open?: boolean
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
