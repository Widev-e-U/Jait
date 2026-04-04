import { useSyncExternalStore } from 'react'
import { buildStoredVsCodeTheme, registerMonacoTheme, type StoredVsCodeTheme } from './vscode-theme'

interface VsCodeThemeStoreState {
  importedThemes: StoredVsCodeTheme[]
  activeThemeId: string | null
}

const STORAGE_KEY = 'jait:vscode-theme-store'
const listeners = new Set<() => void>()
let state: VsCodeThemeStoreState = loadState()
let storageListenerAttached = false

function loadState(): VsCodeThemeStoreState {
  if (typeof window === 'undefined') return { importedThemes: [], activeThemeId: null }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return { importedThemes: [], activeThemeId: null }
  try {
    const parsed = JSON.parse(raw) as Partial<VsCodeThemeStoreState>
    const importedThemes = Array.isArray(parsed.importedThemes)
      ? parsed.importedThemes.filter((theme): theme is StoredVsCodeTheme => Boolean(theme && typeof theme.id === 'string' && typeof theme.monacoThemeName === 'string'))
      : []
    const activeThemeId = typeof parsed.activeThemeId === 'string' ? parsed.activeThemeId : null
    return {
      importedThemes,
      activeThemeId: importedThemes.some((theme) => theme.id === activeThemeId) ? activeThemeId : null,
    }
  } catch {
    return { importedThemes: [], activeThemeId: null }
  }
}

function persist(nextState: VsCodeThemeStoreState): void {
  state = nextState
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  if (!storageListenerAttached && typeof window !== 'undefined') {
    storageListenerAttached = true
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY) return
      state = loadState()
      for (const innerListener of listeners) innerListener()
    })
  }
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): VsCodeThemeStoreState {
  return state
}

export function useVsCodeThemeStore(): VsCodeThemeStoreState & { activeTheme: StoredVsCodeTheme | null } {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    ...snapshot,
    activeTheme: snapshot.importedThemes.find((theme) => theme.id === snapshot.activeThemeId) ?? null,
  }
}

export function getActiveVsCodeTheme(): StoredVsCodeTheme | null {
  return state.importedThemes.find((theme) => theme.id === state.activeThemeId) ?? null
}

export function importVsCodeThemeFromText(sourceLabel: string, text: string): StoredVsCodeTheme {
  const id = `${Date.now().toString(36)}-${hashString(sourceLabel + text)}`
  const theme = buildStoredVsCodeTheme({ id, sourceLabel, text })
  persist({
    importedThemes: [...state.importedThemes.filter((entry) => entry.id !== id), theme],
    activeThemeId: id,
  })
  return theme
}

export function setActiveVsCodeTheme(themeId: string | null): void {
  persist({
    ...state,
    activeThemeId: themeId && state.importedThemes.some((theme) => theme.id === themeId) ? themeId : null,
  })
}

export function removeVsCodeTheme(themeId: string): void {
  persist({
    importedThemes: state.importedThemes.filter((theme) => theme.id !== themeId),
    activeThemeId: state.activeThemeId === themeId ? null : state.activeThemeId,
  })
}

export function ensureActiveMonacoTheme(monaco: { editor?: { defineTheme?: (name: string, data: unknown) => void } } | null | undefined): void {
  registerMonacoTheme(monaco as Parameters<typeof registerMonacoTheme>[0], getActiveVsCodeTheme())
}

function hashString(input: string): string {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36)
}
