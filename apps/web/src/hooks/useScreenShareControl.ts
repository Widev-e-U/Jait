import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScreenShareSessionState } from '@jait/shared'
import { API_URL } from '@/lib/gateway-url'
import { ScreenShareInputQueue } from '@/lib/screen-share-input-queue'
import type { ScreenShareHandle } from './useScreenShare'

type ControlInput = Record<string, unknown>
interface Lease { sessionId: string; chatId: string; viewerDeviceId: string; requestId: string; controlId?: string }

export function useScreenShareControl(
  chatId: string,
  session: ScreenShareSessionState | null,
  share: ScreenShareHandle,
  authToken?: string | null,
) {
  const [active, setActive] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const leaseRef = useRef<Lease | null>(null)
  const epochRef = useRef(0)
  const queueRef = useRef(new ScreenShareInputQueue())
  const lastClipboardRef = useRef<string | null>(null)
  const clipboardErrorRef = useRef(false)
  const sessionId = session?.id ?? null
  const viewerId = share.localDeviceId

  const call = useCallback(async (operation: string, lease: Lease, extra: Record<string, unknown> = {}) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authToken) headers.Authorization = `Bearer ${authToken}`
    const response = await fetch(`${API_URL}/api/screen-share/control/${operation}`, {
      method: 'POST', headers, body: JSON.stringify({ ...lease, ...extra }),
    })
    const data = await response.json() as { ok?: boolean; error?: string; controlId?: string; text?: string | null }
    if (!response.ok || !data.ok) throw new Error(data.error ?? 'Screen control failed.')
    return data
  }, [authToken])

  const release = useCallback(async () => {
    epochRef.current++
    queueRef.current.cancel()
    const lease = leaseRef.current
    leaseRef.current = null
    lastClipboardRef.current = null
    setPending(false)
    setActive(false)
    if (lease) await call('cancel', lease).catch(() => { /* node may already be disconnected */ })
  }, [call])

  const takeControl = useCallback(async () => {
    if (!sessionId || !viewerId || leaseRef.current || pending) return
    setError(null)
    setPending(true)
    const generation = ++epochRef.current
    const lease: Lease = { sessionId, chatId, viewerDeviceId: viewerId, requestId: crypto.randomUUID() }
    leaseRef.current = lease
    try {
      if (!await share.requestControlHandoff('user', chatId)) throw new Error('Could not take control of this share.')
      if (generation !== epochRef.current) return
      const result = await call('start', lease)
      if (!result.controlId) throw new Error('The desktop did not return a control session.')
      lease.controlId = result.controlId
      if (generation !== epochRef.current) {
        await call('cancel', lease).catch(() => {})
        return
      }
      clipboardErrorRef.current = false
      setPending(false)
      setActive(true)
    } catch (reason) {
      if (generation !== epochRef.current) return
      setError(reason instanceof Error ? reason.message : 'Could not start screen control.')
      await release()
    }
  }, [sessionId, viewerId, chatId, pending, share, call, release])

  const agentMode = useCallback(async () => {
    await release()
    if (!await share.requestControlHandoff('agent', chatId)) setError('Could not switch to agent mode.')
  }, [release, share, chatId])

  const fail = useCallback((lease: Lease, reason: unknown) => {
    if (leaseRef.current !== lease) return
    setError(reason instanceof Error ? reason.message : 'Screen control stopped.')
    void release()
  }, [release])

  const send = useCallback((input: ControlInput, move = false) => {
    const lease = leaseRef.current
    if (!lease?.controlId) return
    const action = async () => { await call('act', lease, { input }) }
    const pendingAction = move ? queueRef.current.moveTo(action) : queueRef.current.enqueue(action)
    void pendingAction.catch(reason => fail(lease, reason))
  }, [call, fail])

  const paste = useCallback(() => {
    const lease = leaseRef.current
    if (!lease?.controlId) return
    // Read immediately from the keyboard gesture; some browsers reject reads
    // after the transient activation has expired.
    const read = navigator.clipboard?.readText().catch(() => null)
    if (!read) { setError('Clipboard access is unavailable in this browser.'); return }
    void queueRef.current.enqueue(async () => {
      const text = await read
      if (leaseRef.current !== lease) return
      if (text === null) { setError('Allow clipboard access to paste text.'); return }
      await call('clipboard-write', lease, { text })
      if (leaseRef.current !== lease) return
      lastClipboardRef.current = text
      await call('act', lease, { input: { action: 'key', combo: 'ctrl+v' } })
    }).catch(reason => fail(lease, reason))
  }, [call, fail])

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => {
      const lease = leaseRef.current
      if (!lease?.controlId || !queueRef.current.idle) return
      void queueRef.current.enqueue(async () => {
        const result = await call('clipboard-read', lease)
        if (leaseRef.current !== lease) return
        if (typeof result.text !== 'string' || result.text === lastClipboardRef.current) return
        try {
          if (!navigator.clipboard?.writeText) throw new Error('Clipboard access unavailable')
          await navigator.clipboard.writeText(result.text)
          lastClipboardRef.current = result.text
          clipboardErrorRef.current = false
        } catch {
          if (!clipboardErrorRef.current) setError('Allow clipboard access to receive copied text.')
          clipboardErrorRef.current = true
        }
      }).catch(reason => fail(lease, reason))
    }, 400)
    return () => clearInterval(timer)
  }, [active, call, fail])

  useEffect(() => {
    if (session?.status !== 'sharing' || session.pendingApproval || (active && session.controlOwner !== 'user')) void release()
  }, [session?.status, session?.pendingApproval, session?.controlOwner, active, release])

  useEffect(() => () => {
    epochRef.current++
    queueRef.current.cancel()
    const lease = leaseRef.current
    leaseRef.current = null
    if (lease) void call('cancel', lease).catch(() => {})
  }, [sessionId, chatId, viewerId, call])

  return { active, pending, error, takeControl, agentMode, send, paste }
}
