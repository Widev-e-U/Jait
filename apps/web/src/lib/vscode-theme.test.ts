import { buildStoredVsCodeTheme } from './vscode-theme'

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
