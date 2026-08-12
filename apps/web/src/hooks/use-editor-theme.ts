import { useEffect, useState } from 'react'
import { BUILT_IN_DARK_PLUS_MONACO_THEME_NAME, BUILT_IN_LIGHT_PLUS_MONACO_THEME_NAME } from '@/lib/vscode-theme'

function readThemeName(): string {
  if (typeof document === 'undefined') return BUILT_IN_LIGHT_PLUS_MONACO_THEME_NAME
  const root = document.documentElement
  return root.dataset.monacoTheme ?? (root.classList.contains('dark') ? BUILT_IN_DARK_PLUS_MONACO_THEME_NAME : BUILT_IN_LIGHT_PLUS_MONACO_THEME_NAME)
}

export function useEditorThemeName(): string {
  const [themeName, setThemeName] = useState(readThemeName)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const sync = () => setThemeName(readThemeName())
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'data-monaco-theme'],
    })
    return () => observer.disconnect()
  }, [])

  return themeName
}
