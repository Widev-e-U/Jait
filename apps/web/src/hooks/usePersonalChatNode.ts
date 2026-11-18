import { useCallback, useEffect, useRef, useState } from 'react'
import { getPersonalChatNodeId } from '@jait/shared'
import { toast } from 'sonner'
import { API_URL } from '@/lib/gateway-url'
import { getAuthToken } from '@/lib/auth-token'

/** Persist the execution device separately from provider/model preferences. */
export function usePersonalChatNode(chatId: string | null | undefined, enabled: boolean) {
  const [state, setState] = useState<{ chatId: string; nodeId: string; saving: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const currentChatId = useRef(chatId)
  currentChatId.current = chatId
  const savingRef = useRef(false)

  useEffect(() => {
    if (!enabled || !chatId) return
    const controller = new AbortController()
    setState(null)
    setError(null)
    savingRef.current = false
    void fetch(`${API_URL}/api/sessions/${encodeURIComponent(chatId)}`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error('Could not load chat device')
      const session = await response.json()
      if (!controller.signal.aborted) {
        setState({ chatId, nodeId: getPersonalChatNodeId(session) ?? 'gateway', saving: false })
      }
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load chat device')
    })
    return () => controller.abort()
  }, [chatId, enabled, reload])

  const selectNode = useCallback(async (nodeId: string) => {
    if (!enabled || !chatId || state?.chatId !== chatId || savingRef.current) return
    savingRef.current = true
    setState({ ...state, saving: true })
    try {
      const response = await fetch(`${API_URL}/api/sessions/${encodeURIComponent(chatId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ nodeId }),
      })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.details ?? 'Could not change chat device')
      }
      if (currentChatId.current === chatId) setState({ chatId, nodeId, saving: false })
    } catch (error) {
      if (currentChatId.current === chatId) {
        setState({ ...state, saving: false })
        toast.error(error instanceof Error ? error.message : 'Could not change chat device')
      }
    } finally {
      if (currentChatId.current === chatId) savingRef.current = false
    }
  }, [chatId, enabled, state])

  return {
    nodeId: state && state.chatId === chatId ? state.nodeId : 'gateway',
    busy: enabled && Boolean(chatId) && (state?.chatId !== chatId || Boolean(state?.saving)),
    error,
    selectNode,
    retry: () => setReload(value => value + 1),
  }
}
