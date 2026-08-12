import { useEffect, useState } from 'react'
import type { ThemeMode } from '@/hooks/useAuth'
import { BUILT_IN_DARK_PLUS_MONACO_THEME_NAME, BUILT_IN_LIGHT_PLUS_MONACO_THEME_NAME, applyThemeToDocument } from '@/lib/vscode-theme'
import { useVsCodeThemeStore } from '@/lib/vscode-theme-store'

type BaseThemeMode = ThemeMode | 'light' | 'dark'

function readSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function useConfiguredTheme(baseMode: BaseThemeMode) {
  const { activeTheme } = useVsCodeThemeStore()
  const [systemPrefersDark, setSystemPrefersDark] = useState(readSystemPrefersDark)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => setSystemPrefersDark(media.matches)
    handleChange()
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  const resolvedTheme = activeTheme?.colorMode ?? (baseMode === 'dark' || (baseMode === 'system' && systemPrefersDark) ? 'dark' : 'light')
  const monacoThemeName = activeTheme?.monacoThemeName ?? (resolvedTheme === 'dark' ? BUILT_IN_DARK_PLUS_MONACO_THEME_NAME : BUILT_IN_LIGHT_PLUS_MONACO_THEME_NAME)

  useEffect(() => {
    applyThemeToDocument({
      colorMode: resolvedTheme,
      monacoThemeName,
      theme: activeTheme,
    })
  }, [activeTheme, monacoThemeName, resolvedTheme])

  return {
    activeTheme,
    monacoThemeName,
    resolvedTheme,
  }
}
