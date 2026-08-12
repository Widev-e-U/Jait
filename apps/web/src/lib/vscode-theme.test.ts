import { BUILT_IN_DARK_PLUS_MONACO_THEME_NAME, BUILT_IN_LIGHT_PLUS_MONACO_THEME_NAME, buildStoredVsCodeTheme, registerBuiltInMonacoThemes, type MonacoStandaloneThemeData } from './vscode-theme'

describe('buildStoredVsCodeTheme', () => {
  it('parses commented theme JSON and flattens token scopes', () => {
    const theme = buildStoredVsCodeTheme({
      id: 'night-owl',
      sourceLabel: 'Night Owl.json',
      text: `
        {
          // comment
          "name": "Night Owl",
          "type": "dark",
          "colors": {
            "editor.background": "#011627",
            "editor.foreground": "#d6deeb",
            "button.background": "#82AAFF",
            "focusBorder": "#7FDBCA"
          },
          "tokenColors": [
            {
              "scope": ["keyword", "storage"],
              "settings": { "foreground": "#c792ea", "fontStyle": "bold" }
            },
            {
              "scope": "string, constant.other.symbol",
              "settings": { "foreground": "#ecc48d" }
            },
          ],
        }
      `,
    })

    expect(theme.colorMode).toBe('dark')
    expect(theme.monacoThemeData.base).toBe('vs-dark')
    expect(theme.monacoThemeData.rules).toEqual(expect.arrayContaining([
      { token: 'keyword', foreground: 'c792ea', fontStyle: 'bold' },
      { token: 'storage', foreground: 'c792ea', fontStyle: 'bold' },
      { token: 'string', foreground: 'ecc48d' },
      { token: 'constant.other.symbol', foreground: 'ecc48d' },
    ]))
    expect(theme.cssVariables['--background']).toBe('207 95% 8%')
    expect(theme.cssVariables['--foreground']).toBe('217 34% 88%')
  })

  it('infers light mode from a bright editor background', () => {
    const theme = buildStoredVsCodeTheme({
      id: 'quiet-light',
      sourceLabel: 'Quiet Light.json',
      text: JSON.stringify({
        name: 'Quiet Light',
        colors: {
          'editor.background': '#f5f5f5',
          'editor.foreground': '#333333',
        },
      }),
    })

    expect(theme.colorMode).toBe('light')
    expect(theme.monacoThemeData.base).toBe('vs')
  })
})

describe('registerBuiltInMonacoThemes', () => {
  it('registers the bundled VS Code Dark Plus theme for Monaco', () => {
    const defineTheme = vi.fn()

    registerBuiltInMonacoThemes({ editor: { defineTheme } })

    expect(defineTheme).toHaveBeenCalledWith(BUILT_IN_DARK_PLUS_MONACO_THEME_NAME, expect.objectContaining({
      base: 'vs-dark',
      inherit: false,
      colors: expect.objectContaining({
        'editor.background': '#0B0C0E',
        'editor.foreground': '#D4D4D4',
        'editorWidget.background': '#16181D',
      }),
    }))

    const theme = defineTheme.mock.calls[0]?.[1] as MonacoStandaloneThemeData
    expect(theme.rules).toEqual(expect.arrayContaining([
      { token: 'comment', foreground: '6a9955' },
      { token: 'entity.name.function', foreground: 'dcdcaa' },
      { token: 'support.function', foreground: 'dcdcaa' },
      { token: 'entity.name.type', foreground: '4ec9b0' },
      { token: 'entity.name.class', foreground: '4ec9b0' },
      { token: 'keyword.control', foreground: '569cd6' },
    ]))
  })

  it('registers a bundled light theme that matches the app light palette', () => {
    const defineTheme = vi.fn()

    registerBuiltInMonacoThemes({ editor: { defineTheme } })

    expect(defineTheme).toHaveBeenCalledWith(BUILT_IN_LIGHT_PLUS_MONACO_THEME_NAME, expect.objectContaining({
      base: 'vs',
      inherit: false,
      colors: expect.objectContaining({
        'editor.background': '#EDF0F2',
        'editor.foreground': '#000000',
        'editorGutter.background': '#EDF0F2',
        'editor.lineHighlightBackground': '#E2E6E9',
        'editorWidget.background': '#F3F5F7',
        'editorWidget.border': '#C6CCD2',
      }),
    }))

    const lightCalls = defineTheme.mock.calls.filter((call) => call[0] === BUILT_IN_LIGHT_PLUS_MONACO_THEME_NAME)
    const theme = lightCalls[0]?.[1] as MonacoStandaloneThemeData
    expect(theme.rules).toEqual(expect.arrayContaining([
      { token: 'comment', foreground: '008000' },
      { token: 'string', foreground: 'a31515' },
      { token: 'keyword', foreground: '0000ff' },
      { token: 'entity.name.type', foreground: '267f99' },
      { token: 'entity.name.function', foreground: '795e26' },
      { token: 'variable', foreground: '001080' },
    ]))
  })
})
