import { useState, useEffect } from 'react'

interface ModelInfo {
  provider: string | null
  model: string | null
  ollamaUrl: string | null
  loading: boolean
}

export function useModelInfo(): ModelInfo {
  const [provider, setProvider] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(null)
  const [ollamaUrl, setOllamaUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/health')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        setProvider(data.provider ?? null)
        setModel(data.model ?? null)
        setOllamaUrl(data.ollamaUrl ?? null)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return { provider, model, ollamaUrl, loading }
}
