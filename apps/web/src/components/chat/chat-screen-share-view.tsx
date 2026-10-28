'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_URL } from '@/lib/gateway-url'
import { useScreenShare, type ScreenShareHandle } from '@/hooks/useScreenShare'
import { useScreenShareContext } from '@/hooks/screen-share-context'
import { useScreenShareControl } from '@/hooks/useScreenShareControl'
import { screenShareContentRect, screenSharePoint } from '@/lib/screen-share-pointer'
import { ScreenShareTouchPointer } from '@/lib/screen-share-touch'
import type { ScreenShareSessionState } from '@jait/shared'

interface ChatScreenShareViewProps {
  /** Chat that owns the share. Only this chat may see or control it. */
  chatId: string
  authToken?: string | null
}

/**
 * Renders a node-originated screen share inside the chat that owns it,
 * in a floating panel. Input uses a separately approved desktop-control session.
 */
export function ChatScreenShareView(props: ChatScreenShareViewProps) {
  const shared = useScreenShareContext()
  return shared ? (
    <ChatScreenSharePanel {...props} share={shared} />
  ) : (
    <StandaloneChatScreenShareView {...props} />
  )
}

/**
 * Fallback for trees without a ScreenShareProvider (stories, isolated tests).
 * The app always provides the shared handle, so production never opens a
 * second signaling socket.
 */
function StandaloneChatScreenShareView({ chatId, authToken }: ChatScreenShareViewProps) {
  const share = useScreenShare({ token: authToken ?? undefined })
  return <ChatScreenSharePanel chatId={chatId} authToken={authToken} share={share} />
}

function ChatScreenSharePanel({
  chatId,
  authToken,
  share,
}: ChatScreenShareViewProps & { share: ScreenShareHandle }) {
  const [open, setOpen] = useState(true)
  const [retry, setRetry] = useState(0)
  const [chatSession, setChatSession] = useState<ScreenShareSessionState | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const attachRequestedRef = useRef<string | null>(null)
  const touchPointerRef = useRef(new ScreenShareTouchPointer())
  const [touchCursor, setTouchCursor] = useState<{ left: number; top: number } | null>(null)

  const headers = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authToken) h.Authorization = `Bearer ${authToken}`
    return h
  }, [authToken])

  // ── Load the session this chat owns ──────────────────────────────
  const loadChatSession = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/screen-share/chat/${chatId}`, { headers })
      if (res.status === 404) { setChatSession(null); setLoaded(true); return }
      if (!res.ok) return
      const data = await res.json() as { session?: ScreenShareSessionState | null }
      setChatSession(data.session ?? null)
      setLoaded(true)
    } catch (err) {
      console.error('[chat-screen-share] Failed to load session:', err)
    }
  }, [chatId, headers])

  useEffect(() => {
    void loadChatSession()
    const interval = setInterval(() => { void loadChatSession() }, 5000)
    return () => clearInterval(interval)
  }, [loadChatSession])

  // The chat lookup determines which session is current; websocket state may
  // still refer to a previous share while a new one is being joined.
  const session = loaded ? (share.session?.id === chatSession?.id ? share.session : chatSession)
    : (share.session?.chatId === chatId ? share.session : null)
  const pendingApproval = session?.pendingApproval === true
  const remoteStream = share.session?.id === session?.id ? share.remoteStream : null
  const control = useScreenShareControl(chatId, session, share, authToken)

  const point = (element: HTMLVideoElement, clientX: number, clientY: number) =>
    screenSharePoint(element.getBoundingClientRect(), element.videoWidth, element.videoHeight, clientX, clientY)

  const touchContent = (element: HTMLVideoElement) => {
    const bounds = element.getBoundingClientRect()
    const image = screenShareContentRect(bounds, element.videoWidth, element.videoHeight)
    return image ? { ...image, offsetLeft: image.left - bounds.left, offsetTop: image.top - bounds.top } : null
  }
  const showTouchCursor = (element: HTMLVideoElement, position: { x: number; y: number }) => {
    const image = touchContent(element)
    if (image) setTouchCursor({ left: image.offsetLeft + position.x * image.width, top: image.offsetTop + position.y * image.height })
  }

  useEffect(() => {
    touchPointerRef.current.reset()
    setTouchCursor(null)
  }, [session?.id, control.active])

  // ── Attach as viewer once the host is actually sharing ────────────
  useEffect(() => {
    if (!session || session.status !== 'sharing') return
    if (session.pendingApproval) return
    if (attachRequestedRef.current === session.id) return
    if (remoteStream) return
    attachRequestedRef.current = session.id
    console.log('[chat-screen-share] Attaching to session', session.id.slice(0, 8))
    void share.requestRemoteShare(session.hostDeviceId, session.id)
  }, [session, share, remoteStream, retry])

  const stopShare = useCallback(async () => {
    if (!session) return
    try {
      const res = await fetch(`${API_URL}/api/screen-share/stop`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId: session.id }),
      })
      if (!res.ok) throw new Error('Could not stop the share')
      attachRequestedRef.current = null
      setChatSession(null)
    } catch (err) {
      console.error('[chat-screen-share] Stop failed:', err)
      setNotice('Could not stop the share.')
    }
  }, [session, headers])

  if (!session) return null

  const statusLabel = session.status === 'sharing'
    ? (remoteStream ? 'Live' : pendingApproval ? 'Waiting for approval' : 'Connecting…')
    : session.status === 'paused' ? 'Paused' : 'Stopped'

  return (
    <section aria-label="Chat screen share" data-screen-share-panel data-screen-share-minimized={!open} className={`absolute left-3 top-3 z-30 overflow-hidden rounded-xl border border-border bg-background text-xs shadow-lg ${open ? 'flex h-[min(480px,55%)] w-[min(768px,calc(100%-24px))] flex-col' : 'h-[90px] w-[160px]'}`}>
      {open ? <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <span className={`inline-block h-2 w-2 rounded-full ${remoteStream ? 'bg-green-500' : 'bg-amber-500'}`} />
        <span className="font-medium">Screen share</span>
        <span className="text-muted-foreground">{statusLabel}</span>
        {session.nodeId && <span className="text-muted-foreground">· {session.nodeId}</span>}
        <span className="ml-auto flex items-center gap-2">
          {session.capabilities.remoteInput && remoteStream ? (
            <button type="button" disabled={control.pending}
              className="rounded border border-border px-2 py-0.5 hover:bg-muted disabled:opacity-50"
              onClick={() => void (control.active ? control.agentMode() : control.takeControl())}>
              {control.pending ? 'Waiting for approval…' : control.active ? 'Agent mode' : 'Take control'}
            </button>
          ) : <span className="text-muted-foreground">View only</span>}
          <button
            type="button"
            className="rounded border border-border px-2 py-0.5 hover:bg-muted"
            onClick={() => void stopShare()}
          >
            Stop
          </button>
          <button
            type="button"
            className="rounded border border-border px-2 py-0.5 hover:bg-muted"
            onClick={() => setOpen(v => !v)}
          >
            {open ? 'Hide' : 'Show'}
          </button>
        </span>
      </div> : <button type="button" aria-label="Expand screen share" aria-expanded={false} onClick={() => setOpen(true)} className="flex h-full w-full items-center justify-center gap-2 hover:bg-muted"><span className={`h-2 w-2 rounded-full ${remoteStream ? 'bg-green-500' : 'bg-amber-500'}`} />Screen share</button>}

      {open && (
        <div className="relative min-h-0 flex-1 bg-black/90">
          <video
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-contain ${control.active ? 'cursor-crosshair' : ''}`}
            tabIndex={control.active ? 0 : -1}
            aria-label={control.active ? 'Interactive shared screen' : 'Shared screen'}
            style={{ touchAction: control.active ? 'none' : undefined }}
            onPointerMove={(event) => {
              if (!control.active) return
              if (event.pointerType === 'touch') {
                const image = touchContent(event.currentTarget)
                if (!image) return
                const position = touchPointerRef.current.move(event.pointerId, event.clientX, event.clientY, image.width, image.height)
                if (position) {
                  event.preventDefault()
                  showTouchCursor(event.currentTarget, position)
                  control.send({ action: 'move', ...position }, true)
                }
                return
              }
              const position = point(event.currentTarget, event.clientX, event.clientY)
              if (position) control.send({ action: 'move', ...position }, true)
            }}
            onPointerDown={(event) => {
              if (!control.active || ![0, 1, 2].includes(event.button)) return
              if (event.pointerType === 'touch') {
                if (!touchContent(event.currentTarget) || !touchPointerRef.current.begin(event.pointerId, event.clientX, event.clientY)) return
                event.preventDefault()
                event.currentTarget.focus()
                try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* pointer may already have ended */ }
                showTouchCursor(event.currentTarget, touchPointerRef.current.position)
                return
              }
              const position = point(event.currentTarget, event.clientX, event.clientY)
              if (!position) return
              event.preventDefault()
              event.currentTarget.focus()
              control.send({ action: 'click', ...position, button: event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left' })
            }}
            onPointerUp={(event) => {
              if (!control.active || event.pointerType !== 'touch') return
              const image = touchContent(event.currentTarget)
              if (!image) { touchPointerRef.current.cancel(event.pointerId); return }
              const position = touchPointerRef.current.move(event.pointerId, event.clientX, event.clientY, image.width, image.height)
              if (position) {
                showTouchCursor(event.currentTarget, position)
                control.send({ action: 'move', ...position }, true)
              }
              const click = touchPointerRef.current.end(event.pointerId)
              if (click) control.send({ action: 'click', ...click, button: 'left' })
            }}
            onPointerCancel={(event) => { if (event.pointerType === 'touch') touchPointerRef.current.cancel(event.pointerId) }}
            onContextMenu={(event) => { if (control.active) event.preventDefault() }}
            onWheel={(event) => {
              if (!control.active || !point(event.currentTarget, event.clientX, event.clientY)) return
              event.preventDefault()
              const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY)
              control.send({ action: 'scroll', direction: horizontal ? (event.deltaX > 0 ? 'right' : 'left') : (event.deltaY > 0 ? 'down' : 'up'), amount: 1 })
            }}
            onKeyDown={(event) => {
              if (!control.active || ['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return
              event.preventDefault()
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') { control.paste(); return }
              const modifiers = [event.ctrlKey && 'ctrl', event.altKey && 'alt', event.metaKey && 'win', event.shiftKey && 'shift'].filter(Boolean)
              if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) control.send({ action: 'type', text: event.key })
              else control.send({ action: 'key', combo: [...modifiers, event.key === ' ' ? 'space' : event.key.toLowerCase()].join('+') })
            }}
            ref={(el) => {
              if (el && el.srcObject !== remoteStream) {
                el.srcObject = remoteStream
                void el.play().catch(() => { /* autoplay best-effort */ })
              }
            }}
          />
          {control.active && touchCursor && (
            <span aria-hidden="true" data-screen-share-touch-cursor className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/60 shadow" style={touchCursor} />
          )}
          {pendingApproval && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-4 text-center text-sm text-white">
              <p className="font-medium">Waiting for the node&apos;s user to approve</p>
              <p className="text-xs text-white/70">
                {session.reason ?? 'The agent asked to view this screen.'}
              </p>
            </div>
          )}
          {!remoteStream && !pendingApproval && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
              <div className="text-center">{share.error ?? 'Waiting for video…'}{share.error && <button type="button" className="ml-2 rounded border px-2 py-1" onClick={() => { attachRequestedRef.current = null; setRetry(value => value + 1) }}>Retry</button>}</div>
            </div>
          )}
        </div>
      )}

      {(notice || control.error || share.error) && (
        <div className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
          {notice ?? control.error ?? share.error}
        </div>
      )}
    </section>
  )
}
