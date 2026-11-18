import type { MessengerRequest } from '@jait/shared'
import { getWsUrl } from '@/lib/gateway-url'
import type { MessengerStore } from './store'

/** Connect only after explicit UI opt-in. No Matrix credentials cross this socket. */
export function bindMessengerAssistant(store: MessengerStore, token: string) {
  let stopped = false
  let socket: WebSocket | null = null
  let retry: ReturnType<typeof setTimeout> | undefined
  const seen = new Set<string>()
  const connect = () => {
    if (stopped || !store.getSnapshot().assistantAccess || store.getSnapshot().status !== 'ready') return
    const ws = new WebSocket(getWsUrl())
    socket = ws
    ws.onopen = () => ws.send(JSON.stringify({ type: 'authenticate', token }))
    ws.onmessage = event => {
      let message: { type: string; payload?: unknown }
      try { message = JSON.parse(event.data) } catch { return }
      if (message.type === 'session.created' && (message.payload as { authenticated?: boolean })?.authenticated) {
        if (store.getSnapshot().assistantAccess) ws.send(JSON.stringify({ type: 'messenger.register', payload: { enabled: true } }))
      }
      if (message.type !== 'messenger.request') return
      const request = message.payload as MessengerRequest
      if (!request || typeof request.requestId !== 'string' || seen.has(request.requestId)) return
      seen.add(request.requestId)
      // Bounded deduplication. Never replay requests across reconnects.
      if (seen.size > 256) seen.delete(seen.values().next().value!)
      void store.assistantCommand(request.command, request.expiresAt).then(result => {
        if (!stopped && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({
          type: 'messenger.result', payload: { requestId: request.requestId, result },
        }))
      })
    }
    ws.onclose = () => {
      if (socket === ws) socket = null
      if (!stopped) retry = setTimeout(connect, 3000)
    }
    ws.onerror = () => ws.close()
  }
  connect()
  return () => {
    stopped = true
    clearTimeout(retry)
    socket?.close()
  }
}
