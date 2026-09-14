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

export function getVisibleChatPanelCount(primaryVisible: boolean, secondaryPanelCount: number): number {
  return (primaryVisible ? 1 : 0) + secondaryPanelCount
}

export function shouldShowChatPanelHideButton(visiblePanelCount: number): boolean {
  return visiblePanelCount > 1
}

export function closeSecondaryChatPanel<T extends { session: { id: string } }>(
  panels: T[],
  sessionId: string,
): T[] {
  return panels.filter((entry) => entry.session.id !== sessionId)
}

/**
 * Session ids that are currently open in a chat panel and should therefore be
 * highlighted (blue) in the sidebar. The main panel only counts while it is
 * visible; every secondary panel counts until it is closed — closing one panel
 * must leave the others highlighted.
 */
export function getOpenChatSessionIds(
  primaryVisible: boolean,
  activeSessionId: string | null | undefined,
  secondaryPanels: ReadonlyArray<{ session: { id: string } }>,
): Set<string> {
  const ids = new Set<string>()
  if (primaryVisible && activeSessionId) ids.add(activeSessionId)
  for (const panel of secondaryPanels) ids.add(panel.session.id)
  return ids
}
