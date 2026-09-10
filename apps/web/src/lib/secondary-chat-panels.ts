export const MAX_CHAT_PANELS = 3
export const MAX_SECONDARY_CHAT_PANELS = MAX_CHAT_PANELS - 1

export function appendSecondaryChatPanel<T extends { session: { id: string } }>(
  panels: T[],
  panel: T,
): T[] {
  if (panels.some((entry) => entry.session.id === panel.session.id)) return panels
  if (panels.length >= MAX_SECONDARY_CHAT_PANELS) return panels
  return [...panels, panel]
}
