import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import { getApiUrl } from '@/lib/gateway-url'

export const UnreadChatCountContext = createContext(0)

/** Account-wide count; the project sidebar itself is paginated. */
export function useUnreadChatCount(token?: string | null, onLoginRequired?: () => void) {
  const [count, setCount] = useState(0)
  const request = useRef<{ revision: number; timer: ReturnType<typeof setTimeout> | null; controller: AbortController | null }>({
    revision: 0, timer: null, controller: null,
  })

  const refresh = useCallback(() => {
    const state = request.current
    const revision = ++state.revision
    if (state.timer) clearTimeout(state.timer)
    state.timer = null
    state.controller?.abort()
    state.controller = null
    if (!token) {
      setCount(0)
      return
    }
    const controller = new AbortController()
    state.controller = controller
    void fetch(`${getApiUrl()}/api/sessions/unread-count`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: controller.signal,
    }).then(async response => {
      if (state.revision !== revision) return
      if (response.status === 401) {
        onLoginRequired?.()
        return
      }
      if (!response.ok) return
      const data = await response.json() as { count?: unknown }
      if (state.revision === revision && typeof data.count === 'number' && Number.isSafeInteger(data.count) && data.count >= 0) {
        setCount(data.count)
      }
    }).catch(() => { /* Keep the last count until the next refresh. */ })
  }, [onLoginRequired, token])

  // Coalesce bursts, but invalidate an older in-flight response immediately.
  const scheduleRefresh = useCallback(() => {
    const state = request.current
    state.revision++
    state.controller?.abort()
    state.controller = null
    if (!state.timer) state.timer = setTimeout(refresh, 100)
  }, [refresh])

  useEffect(() => {
    setCount(0)
    refresh()
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      const state = request.current
      state.revision++
      if (state.timer) clearTimeout(state.timer)
      state.timer = null
      state.controller?.abort()
      state.controller = null
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh])

  return { count, refresh, scheduleRefresh }
}
