export type EditorSubpanelToggleIntent = 'open' | 'close'

export function getEditorSubpanelToggleIntent({
  editorOpen,
  subpanelOpen,
}: {
  editorOpen: boolean
  subpanelOpen: boolean
}): EditorSubpanelToggleIntent {
  return editorOpen && subpanelOpen ? 'close' : 'open'
}

export interface EditorSubpanelToggleGuard {
  current: boolean
}

export function beginEditorSubpanelToggle(guard: EditorSubpanelToggleGuard): boolean {
  if (guard.current) return false
  guard.current = true
  return true
}

export function endEditorSubpanelToggle(guard: EditorSubpanelToggleGuard): void {
  guard.current = false
}
