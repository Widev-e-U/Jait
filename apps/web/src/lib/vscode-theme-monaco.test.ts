import { buildStoredVsCodeTheme, ensureBuiltInDarkPlusTextMateTheme, registerMonacoTheme } from './vscode-theme'

vi.mock('@shikijs/monaco', () => ({
  shikiToMonaco: vi.fn((_highlighter, monaco) => {
    const nativeSetTheme = monaco.editor.setTheme.bind(monaco.editor)
    monaco.editor.setTheme = (themeName: string) => {
      if (themeName !== 'dark-plus' && themeName !== 'light-plus') {
        throw new Error(`Shiki theme ${themeName} was not loaded`)
      }
      nativeSetTheme(themeName)
    }
    monaco.editor.setTheme('dark-plus')
  }),
}))

vi.mock('shiki', () => ({
  createHighlighter: vi.fn(async () => ({})),
}))

describe('Monaco themes after Shiki initializes', () => {
  it('applies an imported light theme without Shiki rejecting its name', async () => {
    const setTheme = vi.fn()
    const monaco = {
      editor: { defineTheme: vi.fn(), setTheme },
      languages: { getLanguages: () => [], register: vi.fn() },
    }
    const customLight = buildStoredVsCodeTheme({
      id: 'custom-light',
      sourceLabel: 'Custom Light',
      text: JSON.stringify({
        name: 'Custom Light',
        type: 'light',
        colors: { 'editor.background': '#F5F5F5' },
      }),
    })

    registerMonacoTheme(monaco, customLight)
    ensureBuiltInDarkPlusTextMateTheme(monaco)
    await vi.waitFor(() => expect(setTheme).toHaveBeenCalledWith('dark-plus'))

    expect(() => monaco.editor.setTheme(customLight.monacoThemeName)).not.toThrow()
    expect(setTheme).toHaveBeenCalledWith('light-plus')
    expect(setTheme).toHaveBeenLastCalledWith(customLight.monacoThemeName)
  })
})
