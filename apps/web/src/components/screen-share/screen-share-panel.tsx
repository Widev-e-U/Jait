/**
 * ScreenSharePanel — Remote desktop viewing panel
 *
 * Designed for the primary use case: connecting to a remote device
 * (Electron desktop or mobile) and viewing its screen in real-time.
 *
 * Layout:
 * - When not connected: device list with "Connect" buttons
 * - When connected: full remote screen viewer + small control bar
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Monitor,
  MonitorOff,
  Smartphone,
  Globe,
  Plug,
  PlugZap,
  Users,
  Wifi,
  Loader2,
  Cast,
  Maximize2,
  Minimize2,
  RefreshCw,
  X,
  ScreenShare,
} from 'lucide-react'
import type { ScreenShareState } from '@/hooks/useScreenShare'
import type { ScreenShareDevice } from '@jait/shared'

interface ScreenSharePanelProps {
  screenShare: ScreenShareState & {
    requestRemoteShare: (targetDeviceId: string) => Promise<void>
    disconnect: () => Promise<void>
    acceptPendingShare: () => void
    rejectPendingShare: () => void
    refreshState: () => Promise<void>
    localStream: MediaStream | null
    remoteStream: MediaStream | null
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DeviceIcon({ platform, className }: { platform: string; className?: string }) {
  switch (platform) {
    case 'electron':
      return <Monitor className={className ?? 'h-4 w-4'} />
    case 'react-native':
      return <Smartphone className={className ?? 'h-4 w-4'} />
    default:
      return <Globe className={className ?? 'h-4 w-4'} />
  }
}

function DeviceCard({
  device,
  isLocal,
  isConnected,
  isLoading,
  onConnect,
}: {
  device: ScreenShareDevice
  isLocal: boolean
  isConnected: boolean
  isLoading: boolean
  onConnect: () => void
}) {
  const canConnect = !isLocal && device.capabilities.includes('screen-share')

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
      ${isConnected ? 'bg-green-500/10 border border-green-500/30' : 'bg-muted/50 hover:bg-muted/80'}`}>
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0
        ${isConnected
          ? 'bg-green-500/15 text-green-500'
          : isLocal
            ? 'bg-primary/10 text-primary'
            : 'bg-muted text-muted-foreground'}`}>
        <DeviceIcon platform={device.platform} className="h-4.5 w-4.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate text-[13px]">
          {device.name}
          {isLocal && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {device.platform}
          {isConnected && <span className="text-green-500 ml-1">· connected</span>}
        </div>
      </div>
      {canConnect && !isConnected && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs px-2.5 shrink-0"
          onClick={onConnect}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Plug className="h-3 w-3 mr-1" />
              Connect
            </>
          )}
        </Button>
      )}
      {isConnected && (
        <Badge className="bg-green-500/15 text-green-500 border-green-500/30 shrink-0 text-[10px]">
          <PlugZap className="h-2.5 w-2.5 mr-0.5" /> live
        </Badge>
      )}
    </div>
  )
}

function RemoteScreen({
  stream,
}: {
  stream: MediaStream | null
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    console.log(`[screen-share] RemoteScreen: stream=${!!stream} tracks=${stream?.getTracks().map(t => `${t.kind}:${t.readyState}`).join(',')} videoRef=${!!videoRef.current}`)
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  if (!stream) {
    return (
      <div className="flex-1 bg-black/20 rounded-lg flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <MonitorOff className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Waiting for remote screen…</p>
          <p className="text-xs mt-1 opacity-60">The remote device is preparing to share</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative flex-1 group bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-contain bg-black"
      />
      <button
        onClick={toggleFullscreen}
        className="absolute top-2 right-2 p-1.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ScreenSharePanel({ screenShare }: ScreenSharePanelProps) {
  const session = screenShare.session
  const isConnected = screenShare.isViewer || screenShare.isHost

  console.log(`[screen-share] Panel render: isHost=${screenShare.isHost} isViewer=${screenShare.isViewer} isConnected=${isConnected} remoteStream=${!!screenShare.remoteStream} localStream=${!!screenShare.localStream}`)

  // Remote devices = all devices except this one
  const remoteDevices = screenShare.devices.filter(d => d.id !== screenShare.localDeviceId)
  const localDevice = screenShare.devices.find(d => d.id === screenShare.localDeviceId)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Pending share request prompt (web browser needs user gesture) */}
      {screenShare.pendingShareRequest && !isConnected && (
        <div className="p-3 border-b bg-amber-500/5">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0 mt-0.5">
              <ScreenShare className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Screen share requested</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                A remote device wants to view your screen.
              </p>
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  className="h-7 text-xs px-3"
                  onClick={() => screenShare.acceptPendingShare()}
                >
                  <ScreenShare className="h-3 w-3 mr-1" />
                  Share Screen
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2 text-muted-foreground"
                  onClick={() => screenShare.rejectPendingShare()}
                >
                  Decline
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isConnected ? (
        /* ── Connected view ─────────────────────────────────────────── */
        <div className="flex flex-col flex-1 min-h-0">
          {/* Control bar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20 shrink-0">
            <Badge className="bg-green-500/15 text-green-500 border-green-500/30 text-[10px]">
              <Wifi className="h-2.5 w-2.5 mr-1" /> Live
            </Badge>
            <span className="text-xs text-muted-foreground truncate flex-1">
              {screenShare.connectedDeviceId
                ? screenShare.devices.find(d => d.id === screenShare.connectedDeviceId)?.name ?? screenShare.connectedDeviceId
                : 'Connected'}
            </span>
            {session && (
              <span className="text-[10px] text-muted-foreground">
                {session.transport.routeMode.toUpperCase()} · {session.transport.avgLatencyMs}ms
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2 text-destructive hover:text-destructive"
              onClick={() => screenShare.disconnect()}
            >
              <X className="h-3 w-3 mr-1" />
              Disconnect
            </Button>
          </div>

          {/* Error in connected view */}
          {screenShare.error && (
            <div className="mx-2 p-2 rounded-md bg-red-500/10 text-red-500 text-xs border border-red-500/20">
              {screenShare.error}
            </div>
          )}

          {screenShare.isHost ? (
            /* Host side: this device is being viewed — no need to show own screen */
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Cast className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">Sharing your screen</p>
                <p className="text-xs mt-1 opacity-60">A remote device is viewing this screen</p>
                {session && (
                  <p className="text-xs mt-2 opacity-50">
                    <Users className="h-3 w-3 inline mr-0.5" />
                    {session.viewers.length} viewer{session.viewers.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* Viewer side: show the remote screen stream */
            <>
              <div className="flex-1 min-h-0 p-2">
                <RemoteScreen stream={screenShare.remoteStream} />
              </div>
              {/* Session details */}
              {session && (
                <div className="flex items-center gap-3 px-3 py-1.5 border-t text-[10px] text-muted-foreground shrink-0">
                  <span>Session {session.id.slice(0, 8)}</span>
                  <span>·</span>
                  <span>ICE: {session.transport.iceConnectionState}</span>
                  <span>·</span>
                  <span><Users className="h-2.5 w-2.5 inline mr-0.5" />{session.viewers.length} viewer{session.viewers.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* ── Not connected: show device list ────────────────────────── */
        <div className="flex flex-col gap-3 p-3 overflow-y-auto">
          {/* Error */}
          {screenShare.error && (
            <div className="p-2.5 rounded-md bg-red-500/10 text-red-500 text-xs border border-red-500/20">
              {screenShare.error}
            </div>
          )}

          {/* Remote devices */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Remote Devices
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => screenShare.refreshState()}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>

            {remoteDevices.length === 0 ? (
              <div className="py-6 text-center">
                <Cast className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground font-medium">No remote devices found</p>
                <p className="text-xs text-muted-foreground/60 mt-1 max-w-[200px] mx-auto">
                  Open Jait on another device (desktop app or mobile) to connect to it
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {remoteDevices.map((device) => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    isLocal={false}
                    isConnected={false}
                    isLoading={screenShare.loading && screenShare.connectedDeviceId === device.id}
                    onConnect={() => screenShare.requestRemoteShare(device.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* This device */}
          {localDevice && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                This Device
              </h3>
              <DeviceCard
                device={localDevice}
                isLocal
                isConnected={false}
                isLoading={false}
                onConnect={() => {}}
              />
            </div>
          )}

          {/* Tip */}
          <div className="px-2 py-2 rounded-md bg-muted/30 text-[11px] text-muted-foreground">
            <strong>Tip:</strong> Ask your agent to connect to a device — e.g. &ldquo;Show me my desktop screen&rdquo;
          </div>
        </div>
      )}
    </div>
  )
}
