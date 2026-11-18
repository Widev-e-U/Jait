import { useEffect, useState } from 'react'

const STORAGE_PREFIX = 'jait:last-chat-project:v1:'

function readLastProject(scope: string | null): string | null {
  if (!scope) return null
  try {
    return localStorage.getItem(STORAGE_PREFIX + scope) || null
  } catch {
    return null
  }
}

/** Remember project selection independently of switching to personal chats. */
export function useLastChatProject(scope: string | null, activeProjectId: string | null, pending = false) {
  const [selection, setSelection] = useState(() => ({ scope, id: readLastProject(scope) }))
  const rememberedId = selection.scope === scope ? selection.id : readLastProject(scope)

  useEffect(() => {
    if (selection.scope !== scope) {
      setSelection({ scope, id: readLastProject(scope) })
      return
    }
    // Cached project buckets can briefly contain an old selection during
    // startup or an optimistic move. Remember only a settled selection.
    if (pending) return
    const id = activeProjectId ?? rememberedId
    setSelection((previous) => previous.scope === scope && previous.id === id ? previous : { scope, id })
    if (!scope || !activeProjectId) return
    try {
      localStorage.setItem(STORAGE_PREFIX + scope, activeProjectId)
    } catch {
      // Selection still works in memory when browser storage is unavailable.
    }
  }, [activeProjectId, pending, rememberedId, scope, selection.scope])

  return activeProjectId ?? rememberedId
}
