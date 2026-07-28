export interface SavedProjectPanelState {
  open?: boolean
}

export function resolveProjectPanelOpen(
  explicitOpen: boolean | undefined,
  savedPanel: SavedProjectPanelState | null | undefined,
): boolean {
  if (typeof explicitOpen === 'boolean') return explicitOpen
  if (typeof savedPanel?.open === 'boolean') return savedPanel.open
  return true
}
