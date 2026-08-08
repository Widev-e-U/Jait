import type { ProviderId } from './agents-api'

export type ProviderSelectionView = 'developer' | 'manager'

export interface ModeProviderSelection {
  developer: ProviderId
  manager: ProviderId
}

export function updateModeProviderSelection(
  selection: ModeProviderSelection,
  view: ProviderSelectionView,
  provider: ProviderId,
): ModeProviderSelection {
  if (selection[view] === provider) return selection
  return { ...selection, [view]: provider }
}
