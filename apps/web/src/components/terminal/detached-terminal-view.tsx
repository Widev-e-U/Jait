import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { TerminalView } from './terminal-view'
import { useConfiguredTheme } from '@/hooks/use-configured-theme'

export interface DetachedTerminalPayload {
  id: string
  terminalId: string
  token: string | null
  label: string
  theme: 'light' | 'dark'
  workspaceRoot: string | null
}

const STORAGE_PREFIX = 'jait:detached-terminal:'

function getStorageKey(id: string): string {
  return `${STORAGE_PREFIX}${id}`
}

export function saveDetachedTerminal(payload: DetachedTerminalPayload): void {
  localStorage.setItem(getStorageKey(payload.id), JSON.stringify(payload))
}

export function loadDetachedTerminal(id: string): DetachedTerminalPayload | null {
  const raw = localStorage.getItem(getStorageKey(id))
  if (!raw) return null
  try {
    return JSON.parse(raw) as DetachedTerminalPayload
  } catch {
    return null
  }
}

export function clearDetachedTerminal(id: string): void {
  localStorage.removeItem(getStorageKey(id))
}

export function DetachedTerminalView({ detachedId }: { detachedId: string }) {
  const [payload, setPayload] = useState<DetachedTerminalPayload | null>(() => loadDetachedTerminal(detachedId))
  useConfiguredTheme(payload?.theme ?? 'dark')

  useEffect(() => {
    const sync = () => setPayload(loadDetachedTerminal(detachedId))
    sync()
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [detachedId])

  useEffect(() => {
    if (!payload) return
    document.title = payload.label || 'Terminal'
  }, [payload])

  const handleClose = useCallback(() => {
    clearDetachedTerminal(detachedId)
    window.close()
  }, [detachedId])

  if (!payload) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
        Terminal session not found.
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-3">
        <span className="truncate text-xs text-muted-foreground">{payload.label}</span>
        <button
          onClick={handleClose}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <TerminalView
        terminalId={payload.terminalId}
        className="flex-1"
        token={payload.token}
        workspaceRoot={payload.workspaceRoot}
      />
    </div>
  )
}
