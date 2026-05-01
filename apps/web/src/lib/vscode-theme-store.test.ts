import { beforeEach, describe, expect, it, vi } from 'vitest'

const THEME_JSON = JSON.stringify({
  name: 'Quiet Light',
  colors: {
    'editor.background': '#f5f5f5',
    'editor.foreground': '#333333',
  },
})

beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

async function loadModule() {
  return await import('./vscode-theme-store')
}

describe('vscode-theme-store', () => {
  it('falls back to empty state when localStorage access throws during module load', async () => {
    const windowMock = {
      addEventListener: vi.fn(),
    }

    Object.defineProperty(windowMock, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked')
      },
    })

    vi.stubGlobal('window', windowMock)

    const { getActiveVsCodeTheme } = await loadModule()

    expect(getActiveVsCodeTheme()).toBeNull()
  })

  it('keeps imported theme state in memory when localStorage writes fail', async () => {
    const localStorageMock = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('quota exceeded')
      }),
    }

    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      localStorage: localStorageMock,
    })

    const { importVsCodeThemeFromText, getActiveVsCodeTheme } = await loadModule()
    const importedTheme = importVsCodeThemeFromText('Quiet Light.json', THEME_JSON)

    expect(localStorageMock.setItem).toHaveBeenCalledOnce()
    expect(getActiveVsCodeTheme()).toMatchObject({
      id: importedTheme.id,
      name: 'Quiet Light',
    })
  })
})
