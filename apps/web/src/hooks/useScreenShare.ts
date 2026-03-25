/**
 * useScreenShare — React hook for remote screen viewing via WebRTC
 *
 * Primary use case: User tells the agent to connect to a remote device's
 * screen (Electron desktop app or mobile app). The remote device captures
 * its screen and streams it back to the viewer via WebRTC.
 *
 * Flow:
 * 1. Both devices register with the gateway on mount
 * 2. User (or agent) calls requestRemoteShare(deviceId) → gateway relays
 *    a "screen-share:start-request" WS message to the remote device
 * 3. Remote device auto-captures its screen (Electron desktopCapturer)
 *    and creates a WebRTC offer
 * 4. Viewer receives the offer, creates an answer, ICE candidates exchanged
 * 5. Remote screen appears in the viewer's video element
 *
 * The same hook also handles the HOST side: if this device receives a
 * start-request, it auto-captures and starts streaming.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import type {
  ScreenShareDevice,
  ScreenShareSessionState,
} from '@jait/shared'

import { getApiUrl, getWsUrl } from '@/lib/gateway-url'
import { generateDeviceId, detectPlatform } from '@/lib/device-id'

const API_URL = getApiUrl()
const WS_URL = getWsUrl()

// ── Auto-approve helpers ──────────────────────────────────────────────

const AUTO_APPROVE_KEY = 'jait-screen-share-auto-approve'

function getAutoApprovedDevices(): Set<string> {
  try {
    const raw = localStorage.getItem(AUTO_APPROVE_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch { return new Set() }
}

function addAutoApprovedDevice(deviceId: string): void {
  const set = getAutoApprovedDevices()
  set.add(deviceId)
  localStorage.setItem(AUTO_APPROVE_KEY, JSON.stringify([...set]))
}

// ── Types ─────────────────────────────────────────────────────────────

export interface PendingShareRequest {
  sessionId: string
  hostDeviceId: string
}

export interface ScreenShareState {
  /** Current session state from the gateway */
  session: ScreenShareSessionState | null
  /** All registered screen-share devices */
  devices: ScreenShareDevice[]
  /** Local device ID (this client) */
  localDeviceId: string | null
  /** Whether this client is the host (sharing its screen to a viewer) */
  isHost: boolean
  /** Whether this client is the viewer (seeing a remote screen) */
  isViewer: boolean
  /** Whether a session is active */
  isActive: boolean
  /** Loading state */
  loading: boolean
  /** Error message */
  error: string | null
  /** The device we're currently connected to / viewing */
  connectedDeviceId: string | null
  /** Pending share request (web browser needs user gesture to capture) */
  pendingShareRequest: PendingShareRequest | null
}

export interface DesktopSource {
  id: string
  name: string
  thumbnail: string
  appIcon: string | null
}

interface UseScreenShareOptions {
  token?: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────

function getDeviceName(): string {
  const platform = detectPlatform()
  const ua = navigator.userAgent
  if (platform === 'electron') return `Jait Desktop (${navigator.platform})`
  if (platform === 'capacitor') return 'Jait Mobile'
  if (ua.includes('Chrome')) return `Chrome (${navigator.platform})`
  if (ua.includes('Firefox')) return `Firefox (${navigator.platform})`
  if (ua.includes('Safari')) return `Safari (${navigator.platform})`
  return `Browser (${navigator.platform})`
}

// ── ICE Configuration ─────────────────────────────────────────────────

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

// ── Hook ──────────────────────────────────────────────────────────────

export function useScreenShare(options: UseScreenShareOptions = {}) {
  const { token } = options
  const [state, setState] = useState<ScreenShareState>({
    session: null,
    devices: [],
    localDeviceId: null,
    isHost: false,
    isViewer: false,
    isActive: false,
    loading: false,
    error: null,
    connectedDeviceId: null,
    pendingShareRequest: null,
  })

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const deviceIdRef = useRef<string>(generateDeviceId())
  const pendingOfferRef = useRef<{ sdp: string; hostDeviceId: string; sessionId: string } | null>(null)

  const headers = useCallback(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) h['Authorization'] = `Bearer ${token}`
    return h
  }, [token])

  // ── Register this device on the gateway ───────────────────────────
  const registerDevice = useCallback(async () => {
    const deviceId = deviceIdRef.current
    const platform = detectPlatform()
    const name = getDeviceName()

    const capabilities = ['screen-view']
    if (platform === 'electron') capabilities.push('screen-share', 'remote-input')
    if (platform === 'web') capabilities.push('screen-share')

    try {
      const res = await fetch(`${API_URL}/api/screen-share/devices/register`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ id: deviceId, name, platform, capabilities }),
      })
      if (res.ok) {
        setState(prev => ({ ...prev, localDeviceId: deviceId }))
      }
    } catch (err) {
      console.error('Failed to register screen-share device:', err)
    }
  }, [headers])

  // ── Fetch devices & session state from gateway ────────────────────
  const refreshState = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/screen-share/state`, { headers: headers() })
      if (!res.ok) return
      const data = await res.json() as { devices: ScreenShareDevice[]; activeSession: ScreenShareSessionState | null }
      // Only update devices list and session metadata — don't override
      // isHost/isViewer which are set by user actions
      setState(prev => ({
        ...prev,
        session: data.activeSession ?? prev.session,
        devices: data.devices,
        isActive: data.activeSession?.status === 'sharing',
      }))
    } catch (err) {
      console.error('Failed to refresh screen-share state:', err)
    }
  }, [headers])

  // ── WebRTC setup ──────────────────────────────────────────────────
  const setupPeerConnection = useCallback((stream: MediaStream | null, isHost: boolean, sessionId: string) => {
    console.log(`[screen-share] setupPeerConnection: isHost=${isHost} session=${sessionId.slice(0, 8)} prevPC=${!!pcRef.current} stream=${!!stream} device=${deviceIdRef.current}`)
    pcRef.current?.close()

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    if (isHost && stream) {
      const tracks = stream.getTracks()
      console.log(`[screen-share] Adding ${tracks.length} track(s):`, tracks.map(t => `${t.kind}:${t.label}:${t.readyState}`))
      tracks.forEach(track => pc.addTrack(track, stream))
    }

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams
      console.log(`[screen-share] ontrack: streams=${event.streams.length} tracks=${remoteStream?.getTracks().map(t => `${t.kind}:${t.readyState}`).join(',')}`)
      if (remoteStream) {
        remoteStreamRef.current = remoteStream
        console.log(`[screen-share] remoteStreamRef set, triggering re-render`)
        setState(prev => ({ ...prev }))
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'screen-share:ice-candidate',
          payload: {
            sessionId,
            fromDeviceId: deviceIdRef.current,
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          },
        }))
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log('[screen-share] ICE state:', pc.iceConnectionState)
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        setState(prev => ({ ...prev, error: `Connection ${pc.iceConnectionState}` }))
      }
    }

    if (isHost) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer)
        console.log('[screen-share] Sending offer via WS')
        wsRef.current?.send(JSON.stringify({
          type: 'screen-share:offer',
          payload: { sessionId, hostDeviceId: deviceIdRef.current, sdp: offer.sdp },
        }))
      })
    }

    // If we're a viewer and there's a pending offer that arrived before PC was ready, process it now
    if (!isHost && pendingOfferRef.current) {
      const offer = pendingOfferRef.current
      pendingOfferRef.current = null
      console.log('[screen-share] Processing queued offer')
      pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offer.sdp }))
        .then(() => pc.createAnswer())
        .then(answer => {
          pc.setLocalDescription(answer)
          wsRef.current?.send(JSON.stringify({
            type: 'screen-share:answer',
            payload: {
              sessionId: offer.sessionId,
              viewerDeviceId: deviceIdRef.current,
              sdp: answer.sdp,
            },
          }))
        })
        .catch(err => console.error('[screen-share] Failed to process queued offer:', err))
    }
  }, [])

  // ── Start sharing THIS device's screen (HOST side) ────────────────
  // Called automatically when receiving a start-request, or manually
  const startHosting = useCallback(async (sessionId?: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      let stream: MediaStream

      // Both Electron and web browsers use getDisplayMedia.
      // In Electron, the main process handles source selection via
      // setDisplayMediaRequestHandler (auto-selects primary screen).
      // In web browsers, the browser shows its native picker.
      // On mobile (Capacitor WebView / mobile browsers), getDisplayMedia
      // is not available — guard against it.
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('Screen sharing is not supported on this device. Use a desktop browser or the Electron app.')
      }
      console.log('[screen-share] Requesting screen capture via getDisplayMedia...')
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 15, max: 30 } },
        audio: false,
      })
      console.log('[screen-share] Screen capture obtained:', stream.getVideoTracks()[0]?.label)

      localStreamRef.current = stream

      if (!sessionId) {
        await registerDevice()
        const res = await fetch(`${API_URL}/api/screen-share/start`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ hostDeviceId: deviceIdRef.current }),
        })
        if (!res.ok) {
          const err = await res.json() as { error: string }
          throw new Error(err.error)
        }
        const data = await res.json() as { session: ScreenShareSessionState }
        sessionId = data.session.id
        setState(prev => ({ ...prev, session: data.session }))
      }

      setState(prev => ({ ...prev, isHost: true, isViewer: false, isActive: true, loading: false }))
      console.log('[screen-share] Host capturing — setting up peer connection for session:', sessionId)
      setupPeerConnection(stream, true, sessionId ?? '')
    } catch (err) {
      console.error('[screen-share] Capture failed:', err)
      setState(prev => ({
        ...prev,
        loading: false,
        isHost: false,
        error: err instanceof Error ? err.message : 'Failed to start screen capture',
      }))
    }
  }, [registerDevice, headers, setupPeerConnection])

  // ── Request a remote device to share its screen (VIEWER side) ─────
  const requestRemoteShare = useCallback(async (targetDeviceId: string) => {
    setState(prev => ({ ...prev, loading: true, error: null, connectedDeviceId: targetDeviceId }))

    try {
      await registerDevice()

      const res = await fetch(`${API_URL}/api/screen-share/start`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          hostDeviceId: targetDeviceId,
          viewerDeviceIds: [deviceIdRef.current],
        }),
      })

      if (!res.ok) {
        const err = await res.json() as { error: string }
        throw new Error(err.error)
      }

      const { session } = await res.json() as { session: ScreenShareSessionState }

      setState(prev => ({ ...prev, session, isViewer: true, isActive: true, loading: false }))

      // Set up WebRTC as viewer (receive-only) — the REST route already
      // sends a WS start-request to the host device, so we just need to
      // be ready to receive the offer.
      // Guard: the WS start-request handler may have already created
      // the peer connection while we were awaiting the HTTP response.
      // Re-creating it would destroy the active connection and cause
      // a black screen (dead stream still in remoteStreamRef).
      console.log(`[screen-share] requestRemoteShare: HTTP done, session=${session.id.slice(0, 8)} pcRef=${!!pcRef.current}`)
      if (!pcRef.current) {
        console.log('[screen-share] requestRemoteShare: creating viewer PC (no WS-created PC yet)')
        setupPeerConnection(null, false, session.id)
      } else {
        console.log('[screen-share] requestRemoteShare: PC already exists, skipping creation')
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        connectedDeviceId: null,
        error: err instanceof Error ? err.message : 'Failed to connect to remote device',
      }))
    }
  }, [registerDevice, headers, setupPeerConnection])

  // ── Disconnect ────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    remoteStreamRef.current = null
    pcRef.current?.close()
    pcRef.current = null

    try {
      await fetch(`${API_URL}/api/screen-share/stop`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({}),
      })
    } catch { /* best-effort */ }

    setState(prev => ({
      ...prev,
      session: null,
      isHost: false,
      isViewer: false,
      isActive: false,
      connectedDeviceId: null,
      pendingShareRequest: null,
    }))
  }, [headers])

  // ── Accept a pending share request (user clicked the prompt) ──────
  const acceptPendingShare = useCallback(() => {
    const pending = state.pendingShareRequest
    if (!pending) return
    setState(prev => ({ ...prev, pendingShareRequest: null }))
    startHosting(pending.sessionId)
  }, [state.pendingShareRequest, startHosting])

  // ── Reject a pending share request ────────────────────────────────
  const rejectPendingShare = useCallback(() => {
    setState(prev => ({ ...prev, pendingShareRequest: null }))
  }, [])

  // ── Get Electron desktop sources ──────────────────────────────────
  const getDesktopSources = useCallback(async (): Promise<DesktopSource[]> => {
    if (!window.jaitDesktop) return []
    try { return await window.jaitDesktop.getDesktopSources() } catch { return [] }
  }, [])

  // ── WebSocket signaling (with auto-reconnect) ──────────────────────
  useEffect(() => {
    // Don't open a WebSocket until the user is authenticated.
    // Without this guard the hook reconnects every 2 s during the auth gate,
    // causing state churn and drag-lag on Windows/Electron.
    if (!token) return

    let mounted = true
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (!mounted) return
      const wsUrl = `${WS_URL}${token ? `?token=${token}` : ''}`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[screen-share] WS connected')
        ws.send(JSON.stringify({ type: 'subscribe', deviceId: deviceIdRef.current }))
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; payload: unknown }
          if (msg.type.startsWith('screen-share:')) {
            console.log(`[screen-share] WS recv: ${msg.type}`, JSON.stringify(msg.payload).slice(0, 300))
          }

          switch (msg.type) {
            case 'screen-share:state-update': {
              const session = msg.payload as ScreenShareSessionState
              if (session.status === 'idle') {
                // Session ended remotely — full cleanup
                localStreamRef.current?.getTracks().forEach(t => t.stop())
                localStreamRef.current = null
                remoteStreamRef.current = null
                pcRef.current?.close()
                pcRef.current = null
                setState(prev => ({
                  ...prev,
                  session: null,
                  isHost: false,
                  isViewer: false,
                  isActive: false,
                  connectedDeviceId: null,
                  pendingShareRequest: null,
                }))
              } else {
                // Session metadata update — DON'T override isHost/isViewer
                setState(prev => ({ ...prev, session, isActive: session.status === 'sharing' }))
              }
              break
            }

            // A viewer wants this device to start sharing its screen,
            // OR this device should set itself up as a viewer.
            case 'screen-share:start-request': {
              const req = msg.payload as {
                sessionId: string
                hostDeviceId: string
                viewerDeviceIds?: string[]
              }

              console.log(`[screen-share] start-request: host=${req.hostDeviceId} local=${deviceIdRef.current} viewers=[${req.viewerDeviceIds?.join(',')}] isHostMatch=${req.hostDeviceId === deviceIdRef.current} pcRef=${!!pcRef.current}`)

              if (req.hostDeviceId === deviceIdRef.current) {
                // ── HOST side: we're being asked to share our screen ────
                const viewerId = req.viewerDeviceIds?.[0] ?? 'unknown'
                const autoApproved = getAutoApprovedDevices()

                if (autoApproved.has(viewerId) || autoApproved.has('*')) {
                  console.log('[screen-share] Auto-approved share request from', viewerId)
                  startHosting(req.sessionId)
                  break
                }

                const platform = detectPlatform()

                if (platform === 'electron') {
                  window.jaitDesktop?.notify({
                    title: 'Screen Share Request',
                    body: 'A remote device wants to view your screen.',
                  }).catch(() => { /* best-effort */ })
                }

                // Single toast combining share + always-allow options
                const toastId = toast('Screen share requested', {
                  description: 'A remote device wants to view your screen.',
                  duration: Infinity,
                  action: {
                    label: 'Always Allow',
                    onClick: () => {
                      console.log('[screen-share] User accepted + enabled always-approve')
                      addAutoApprovedDevice('*')
                      startHosting(req.sessionId)
                      toast.dismiss(toastId)
                    },
                  },
                  cancel: {
                    label: 'Share Once',
                    onClick: () => {
                      console.log('[screen-share] User accepted share request (once)')
                      startHosting(req.sessionId)
                      toast.dismiss(toastId)
                    },
                  },
                })

              } else if (
                !req.viewerDeviceIds ||
                req.viewerDeviceIds.length === 0 ||
                req.viewerDeviceIds.includes(deviceIdRef.current)
              ) {
                // ── VIEWER side: set up WebRTC to receive the host's stream ─
                // Skip if we already initiated via requestRemoteShare (PC already created)
                if (pcRef.current) {
                  console.log('[screen-share] Viewer PC already set up, skipping duplicate start-request')
                  break
                }
                // Stop any local capture if we were previously hosting
                if (localStreamRef.current) {
                  localStreamRef.current.getTracks().forEach(t => t.stop())
                  localStreamRef.current = null
                }
                console.log('[screen-share] Setting up as viewer for session:', req.sessionId, 'host:', req.hostDeviceId)
                setState(prev => ({
                  ...prev,
                  isViewer: true,
                  isHost: false,
                  isActive: true,
                  connectedDeviceId: req.hostDeviceId,
                }))
                setupPeerConnection(null, false, req.sessionId)
              }

              break
            }

            case 'screen-share:offer': {
              const offer = msg.payload as { sdp: string; hostDeviceId: string; sessionId: string }
              if (offer.hostDeviceId === deviceIdRef.current) {
                console.log('[screen-share] Ignoring own offer (we are the host)')
                break
              }
              console.log(`[screen-share] Received offer from host=${offer.hostDeviceId} pcRef=${!!pcRef.current}`)
              const pc = pcRef.current
              if (pc) {
                pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offer.sdp }))
                  .then(() => pc.createAnswer())
                  .then(answer => {
                    pc.setLocalDescription(answer)
                    console.log('[screen-share] Sending answer')
                    wsRef.current?.send(JSON.stringify({
                      type: 'screen-share:answer',
                      payload: {
                        sessionId: offer.sessionId,
                        viewerDeviceId: deviceIdRef.current,
                        sdp: answer.sdp,
                      },
                    }))
                  })
                  .catch(err => console.error('[screen-share] Offer handling failed:', err))
              } else {
                // PC not ready yet (viewer still in requestRemoteShare) — queue the offer
                console.log('[screen-share] PC not ready, queuing offer')
                pendingOfferRef.current = offer
              }
              break
            }

            case 'screen-share:answer': {
              const answer = msg.payload as { sdp: string; viewerDeviceId: string }
              if (answer.viewerDeviceId === deviceIdRef.current) {
                console.log('[screen-share] Ignoring own answer (we are the viewer)')
                break
              }
              console.log(`[screen-share] Received answer from viewer=${answer.viewerDeviceId}`)
              pcRef.current?.setRemoteDescription(
                new RTCSessionDescription({ type: 'answer', sdp: answer.sdp })
              )
              break
            }

            case 'screen-share:ice-candidate': {
              const ice = msg.payload as {
                candidate: string
                sdpMid: string | null
                sdpMLineIndex: number | null
                fromDeviceId: string
              }
              if (ice.fromDeviceId === deviceIdRef.current) break
              console.log(`[screen-share] ICE candidate from=${ice.fromDeviceId} pcRef=${!!pcRef.current}`)
              pcRef.current?.addIceCandidate(new RTCIceCandidate({
                candidate: ice.candidate,
                sdpMid: ice.sdpMid,
                sdpMLineIndex: ice.sdpMLineIndex,
              }))
              break
            }
          }
        } catch {
          // Ignore non-screen-share messages
        }
      }

      ws.onclose = () => {
        wsRef.current = null
        // Auto-reconnect after 2s
        if (mounted) {
          reconnectTimer = setTimeout(connect, 2000)
        }
      }

      ws.onerror = () => {
        // onclose fires after onerror, so reconnection is handled there
      }
    }

    connect()

    return () => {
      mounted = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      wsRef.current?.close()
      wsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Register on mount, fetch initial state once (no polling — WS pushes updates)
  useEffect(() => {
    if (!token) return
    registerDevice()
    refreshState()
  }, [token, registerDevice, refreshState])

  // Listen for Electron tray commands
  useEffect(() => {
    if (window.jaitDesktop) {
      window.jaitDesktop.onScreenShareStart(() => startHosting())
      window.jaitDesktop.onScreenShareStop(() => disconnect())
    }
  }, [startHosting, disconnect])

  return {
    ...state,
    requestRemoteShare,
    startHosting,
    disconnect,
    acceptPendingShare,
    rejectPendingShare,
    getDesktopSources,
    refreshState,
    localStream: localStreamRef.current,
    remoteStream: remoteStreamRef.current,
  }
}
