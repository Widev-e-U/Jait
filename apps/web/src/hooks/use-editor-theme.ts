import { useEffect, useState } from 'react'

function readThemeName(): string {
  if (typeof document === 'undefined') return 'vs'
  const root = document.documentElement
  return root.dataset.monacoTheme ?? (root.classList.contains('dark') ? 'vs-dark' : 'vs')
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
