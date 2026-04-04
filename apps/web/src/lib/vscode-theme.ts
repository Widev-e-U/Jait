export interface MonacoStandaloneThemeRule {
  token: string
  foreground?: string
  background?: string
  fontStyle?: string
}

export interface MonacoStandaloneThemeData {
  base: 'vs' | 'vs-dark'
  inherit: boolean
  rules: MonacoStandaloneThemeRule[]
  colors: Record<string, string>
}

interface VsCodeThemeTokenRule {
  scope?: string | string[]
  settings?: {
    foreground?: string
    background?: string
    fontStyle?: string
  }
}

interface VsCodeThemeDocument {
  name?: string
  type?: 'dark' | 'light' | 'hc-dark' | 'hc-light'
  colors?: Record<string, string>
  tokenColors?: VsCodeThemeTokenRule[]
  include?: string
}

export interface StoredVsCodeTheme {
  id: string
  name: string
  sourceLabel: string
  importedAt: string
  colorMode: 'dark' | 'light'
  monacoThemeName: string
  monacoThemeData: MonacoStandaloneThemeData
  cssVariables: Record<string, string>
  rawColors: Record<string, string>
  hasInclude: boolean
}

interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

const THEME_SEARCH_TERMS = [
  'editor theme',
  'vscode theme',
  'monaco theme',
  'workbench colors',
]

const appliedThemeVariableKeys = new Set<string>()

export function getVsCodeThemeSearchTerms(): string[] {
  return THEME_SEARCH_TERMS
}

export function buildStoredVsCodeTheme(input: {
  id: string
  sourceLabel: string
  importedAt?: string
  text: string
}): StoredVsCodeTheme {
  const parsed = parseVsCodeThemeDocument(input.text)
  const colors = sanitizeColorMap(parsed.colors ?? {})
  const colorMode = inferColorMode(parsed, colors)
  const name = parsed.name?.trim() || input.sourceLabel.trim() || 'Imported Theme'
  const monacoThemeName = `jait-vscode-${slugify(name)}-${input.id}`

  return {
    id: input.id,
    name,
    sourceLabel: input.sourceLabel,
    importedAt: input.importedAt ?? new Date().toISOString(),
    colorMode,
    monacoThemeName,
    monacoThemeData: {
      base: colorMode === 'dark' ? 'vs-dark' : 'vs',
      inherit: true,
      rules: buildMonacoRules(parsed.tokenColors ?? []),
      colors,
    },
    cssVariables: buildCssVariables(colors),
    rawColors: colors,
    hasInclude: typeof parsed.include === 'string' && parsed.include.trim().length > 0,
  }
}

export function parseVsCodeThemeDocument(text: string): VsCodeThemeDocument {
  const cleaned = stripTrailingCommas(stripJsonComments(text))
  const parsed = JSON.parse(cleaned) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Theme file must contain a JSON object.')
  }
  return parsed as VsCodeThemeDocument
}

export function registerMonacoTheme(
  monaco: { editor?: { defineTheme?: (name: string, data: MonacoStandaloneThemeData) => void } } | null | undefined,
  theme: StoredVsCodeTheme | null | undefined,
): void {
  if (!theme || !monaco?.editor?.defineTheme) return
  monaco.editor.defineTheme(theme.monacoThemeName, theme.monacoThemeData)
}

export function applyThemeToDocument(options: {
  colorMode: 'dark' | 'light'
  monacoThemeName: string
  theme: StoredVsCodeTheme | null
}): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', options.colorMode === 'dark')
  root.dataset.monacoTheme = options.monacoThemeName

  for (const key of appliedThemeVariableKeys) root.style.removeProperty(key)
  appliedThemeVariableKeys.clear()

  if (!options.theme) return
  for (const [key, value] of Object.entries(options.theme.cssVariables)) {
    root.style.setProperty(key, value)
    appliedThemeVariableKeys.add(key)
  }
}

function buildMonacoRules(tokenColors: VsCodeThemeTokenRule[]): MonacoStandaloneThemeRule[] {
  const rules: MonacoStandaloneThemeRule[] = []
  for (const tokenColor of tokenColors) {
    const settings = tokenColor.settings ?? {}
    const scopes = splitScopes(tokenColor.scope)
    if (scopes.length === 0) continue
    const foreground = normalizeRuleColor(settings.foreground)
    const background = normalizeRuleColor(settings.background)
    const fontStyle = settings.fontStyle?.trim() || undefined
    for (const scope of scopes) {
      rules.push({ token: scope, foreground, background, fontStyle })
    }
  }
  return rules
}

function buildCssVariables(colors: Record<string, string>): Record<string, string> {
  const variables: Record<string, string> = {}
  const background = pickColor(colors, ['editor.background', 'sideBar.background', 'panel.background'])
  const foreground = pickColor(colors, ['editor.foreground', 'foreground'])
  const card = pickColor(colors, ['sideBar.background', 'panel.background', 'editorWidget.background'])
  const muted = pickColor(colors, ['panel.background', 'tab.inactiveBackground', 'editorGroupHeader.tabsBackground'])
  const accent = pickColor(colors, ['list.hoverBackground', 'tab.activeBackground', 'editor.lineHighlightBackground'])
  const primary = pickColor(colors, ['button.background', 'focusBorder', 'textLink.foreground'])
  const border = pickColor(colors, ['widget.border', 'panel.border', 'sideBar.border', 'contrastBorder'])

  setSemanticColor(variables, '--background', background)
  setSemanticColor(variables, '--foreground', foreground)
  setSemanticColor(variables, '--card', card)
  setSemanticColor(variables, '--card-foreground', pickColor(colors, ['sideBar.foreground', 'foreground']) ?? foreground)
  setSemanticColor(variables, '--popover', pickColor(colors, ['editorWidget.background', 'panel.background']) ?? card)
  setSemanticColor(variables, '--popover-foreground', pickColor(colors, ['editorWidget.foreground', 'foreground']) ?? foreground)
  setSemanticColor(variables, '--primary', primary)
  setSemanticColor(variables, '--primary-foreground', chooseReadableForeground(primary))
  setSemanticColor(variables, '--secondary', pickColor(colors, ['tab.inactiveBackground', 'panel.background']) ?? muted)
  setSemanticColor(variables, '--secondary-foreground', pickColor(colors, ['tab.inactiveForeground', 'foreground']) ?? foreground)
  setSemanticColor(variables, '--muted', muted)
  setSemanticColor(variables, '--muted-foreground', pickColor(colors, ['descriptionForeground', 'input.placeholderForeground', 'disabledForeground']))
  setSemanticColor(variables, '--accent', accent)
  setSemanticColor(variables, '--accent-foreground', pickColor(colors, ['list.activeSelectionForeground', 'foreground']) ?? foreground)
  setSemanticColor(variables, '--destructive', pickColor(colors, ['inputValidation.errorBackground', 'errorForeground', 'list.errorForeground']))
  setSemanticColor(variables, '--destructive-foreground', chooseReadableForeground(pickColor(colors, ['inputValidation.errorBackground', 'errorForeground'])))
  setSemanticColor(variables, '--border', border)
  setSemanticColor(variables, '--input', pickColor(colors, ['input.background', 'editorWidget.background', 'dropdown.background']) ?? border)
  setSemanticColor(variables, '--ring', pickColor(colors, ['focusBorder', 'button.background', 'textLink.foreground']) ?? primary)
  setSemanticColor(variables, '--scrollbar-track', pickColor(colors, ['editor.background', 'sideBar.background', 'panel.background']) ?? background)
  setSemanticColor(variables, '--scrollbar-thumb', pickColor(colors, ['scrollbarSlider.background', 'scrollbar.shadow']))
  setSemanticColor(variables, '--scrollbar-thumb-hover', pickColor(colors, ['scrollbarSlider.hoverBackground', 'scrollbarSlider.activeBackground', 'scrollbarSlider.background']))
  setSemanticColor(variables, '--toast-bg', pickColor(colors, ['notifications.background', 'editorWidget.background', 'panel.background']) ?? card, true)
  setSemanticColor(variables, '--toast-border', pickColor(colors, ['notifications.border', 'widget.border', 'panel.border']) ?? border, true)
  setSemanticColor(variables, '--toast-success-accent', pickColor(colors, ['testing.iconPassed', 'terminal.ansiGreen']))
  setSemanticColor(variables, '--toast-info-accent', pickColor(colors, ['textLink.foreground', 'focusBorder']) ?? primary)
  setSemanticColor(variables, '--toast-warning-accent', pickColor(colors, ['editorWarning.foreground', 'terminal.ansiYellow']))
  setSemanticColor(variables, '--toast-error-accent', pickColor(colors, ['editorError.foreground', 'terminal.ansiRed']))

  const tabBg = pickColor(colors, ['editorGroupHeader.tabsBackground', 'tab.inactiveBackground', 'sideBar.background'])
  if (tabBg) variables['--tab-bg'] = tabBg
  const ctxSystem = pickColor(colors, ['activityBarBadge.background', 'button.background', 'focusBorder'])
  const ctxHistory = pickColor(colors, ['textLink.foreground', 'terminal.ansiBlue'])
  const ctxToolResults = pickColor(colors, ['editorWarning.foreground', 'terminal.ansiYellow'])
  const ctxTools = pickColor(colors, ['terminal.ansiMagenta', 'badge.background'])
  if (ctxSystem) variables['--ctx-system'] = ctxSystem
  if (ctxHistory) variables['--ctx-history'] = ctxHistory
  if (ctxToolResults) variables['--ctx-tool-results'] = ctxToolResults
  if (ctxTools) variables['--ctx-tools'] = ctxTools

  return variables
}

function setSemanticColor(
  variables: Record<string, string>,
  cssVariable: string,
  color: string | null | undefined,
  includeAlpha = false,
): void {
  if (!color) return
  const hsl = toHslCssChannels(color, includeAlpha)
  if (hsl) variables[cssVariable] = hsl
}

function chooseReadableForeground(color: string | null | undefined): string | null {
  const rgba = parseColor(color)
  if (!rgba) return null
  const luminance = (0.2126 * rgba.r + 0.7152 * rgba.g + 0.0722 * rgba.b) / 255
  return luminance > 0.55 ? '0 0% 7%' : '0 0% 100%'
}

function inferColorMode(parsed: VsCodeThemeDocument, colors: Record<string, string>): 'dark' | 'light' {
  if (parsed.type === 'light' || parsed.type === 'hc-light') return 'light'
  if (parsed.type === 'dark' || parsed.type === 'hc-dark') return 'dark'
  const background = parseColor(colors['editor.background'] ?? colors['sideBar.background'] ?? '')
  if (!background) return 'dark'
  const luminance = (0.2126 * background.r + 0.7152 * background.g + 0.0722 * background.b) / 255
  return luminance > 0.55 ? 'light' : 'dark'
}

function sanitizeColorMap(colors: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(colors)) {
    if (typeof value === 'string' && value.trim()) next[key] = value.trim()
  }
  return next
}

function splitScopes(scope: string | string[] | undefined): string[] {
  if (Array.isArray(scope)) return scope.flatMap((entry) => entry.split(',')).map((entry) => entry.trim()).filter(Boolean)
  if (typeof scope !== 'string') return []
  return scope.split(',').map((entry) => entry.trim()).filter(Boolean)
}

function normalizeRuleColor(color: string | undefined): string | undefined {
  if (!color) return undefined
  const trimmed = color.trim()
  if (!trimmed.startsWith('#')) return undefined
  return normalizeHex(trimmed).slice(1)
}

function pickColor(colors: Record<string, string>, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const value = colors[candidate]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function toHslCssChannels(color: string, includeAlpha = false): string | null {
  const rgba = parseColor(color)
  if (!rgba) return null

  const red = rgba.r / 255
  const green = rgba.g / 255
  const blue = rgba.b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const lightness = (max + min) / 2

  let hue = 0
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6
    else if (max === green) hue = (blue - red) / delta + 2
    else hue = (red - green) / delta + 4
    hue *= 60
  }
  if (hue < 0) hue += 360

  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))
  const base = `${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`
  if (includeAlpha && rgba.a < 1) return `${base} / ${Number(rgba.a.toFixed(3))}`
  return base
}

function parseColor(color: string | null | undefined): RgbaColor | null {
  if (!color) return null
  const trimmed = color.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('#')) return parseHexColor(trimmed)

  const rgbMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i)
  if (!rgbMatch) return null
  const parts = rgbMatch[1].split(',').map((part) => part.trim())
  if (parts.length < 3) return null
  const r = parseRgbChannel(parts[0])
  const g = parseRgbChannel(parts[1])
  const b = parseRgbChannel(parts[2])
  const a = parts[3] == null ? 1 : parseAlpha(parts[3])
  if (r == null || g == null || b == null || a == null) return null
  return { r, g, b, a }
}

function parseHexColor(color: string): RgbaColor | null {
  const hex = normalizeHex(color).slice(1)
  if (hex.length === 6) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: 1,
    }
  }
  if (hex.length === 8) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: Number.parseInt(hex.slice(6, 8), 16) / 255,
    }
  }
  return null
}

function parseRgbChannel(channel: string): number | null {
  if (channel.endsWith('%')) {
    const percent = Number.parseFloat(channel.slice(0, -1))
    if (!Number.isFinite(percent)) return null
    return clampChannel(Math.round((percent / 100) * 255))
  }
  const value = Number.parseFloat(channel)
  if (!Number.isFinite(value)) return null
  return clampChannel(Math.round(value))
}

function parseAlpha(alpha: string): number | null {
  const value = Number.parseFloat(alpha)
  if (!Number.isFinite(value)) return null
  return Math.max(0, Math.min(1, value))
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, value))
}

function normalizeHex(color: string): string {
  const raw = color.trim().slice(1)
  if (raw.length === 3 || raw.length === 4) {
    return `#${raw.split('').map((char) => `${char}${char}`).join('').toLowerCase()}`
  }
  return `#${raw.toLowerCase()}`
}

function stripJsonComments(input: string): string {
  let output = ''
  let inString = false
  let inLineComment = false
  let inBlockComment = false
  let escaped = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false
        output += char
      }
      continue
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        index += 1
      }
      continue
    }

    if (inString) {
      output += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') {
      inString = true
      output += char
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      index += 1
      continue
    }

    if (char === '/' && next === '*') {
      inBlockComment = true
      index += 1
      continue
    }

    output += char
  }

  return output
}

function stripTrailingCommas(input: string): string {
  return input.replace(/,\s*([}\]])/g, '$1')
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'theme'
}
