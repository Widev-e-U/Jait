import { createRoot } from 'react-dom/client'
import type { ScreenShareSessionState } from '@jait/shared'
import { ChatScreenShareView } from '@/components/chat/chat-screen-share-view'
import { ScreenShareProvider } from '@/hooks/screen-share-context'
import type { ScreenShareHandle } from '@/hooks/useScreenShare'
import '@/index.css'

const session: ScreenShareSessionState = {
  id: 'fixture-share', status: 'sharing', hostDeviceId: 'fixture-host', controllerDeviceId: null,
  viewers: [{ deviceId: 'fixture-viewer', connectedAt: '', canControl: true, transportMode: 'p2p', latencyMs: 0 }],
  capabilities: { remoteInput: true, recording: false, turnRelay: false, adaptiveStreaming: false },
  transport: { iceConnectionState: 'connected', routeMode: 'p2p', avgLatencyMs: 0, relayActive: false },
  updatedAt: '', chatId: 'fixture-chat', nodeId: 'fixture-host', controlOwner: 'user', pendingApproval: false,
}
const canvas = document.createElement('canvas')
canvas.width = 640
canvas.height = 360
const context = canvas.getContext('2d')!
const stream = canvas.captureStream(10)
let frame = 0
setInterval(() => {
  context.fillStyle = frame++ % 2 ? '#2587cd' : '#2da36a'
  context.fillRect(0, 0, canvas.width, canvas.height)
}, 100)

const share: ScreenShareHandle = {
  session, devices: [], localDeviceId: 'fixture-viewer', isHost: false, isViewer: true,
  isActive: true, loading: false, error: null, connectedDeviceId: 'fixture-host',
  pendingShareRequest: null, chatId: 'fixture-chat', controlOwner: 'user', requestReason: null,
  localStream: null, remoteStream: stream,
  requestRemoteShare: async () => {}, startHosting: async () => {}, disconnect: async () => {},
  acceptPendingShare: () => {}, rejectPendingShare: () => {}, approveSession: async () => true,
  requestControlHandoff: async () => true, getDesktopSources: async () => [], refreshState: async () => {},
}

createRoot(document.getElementById('root')!).render(
  <main className="relative h-screen w-full">
    <ScreenShareProvider value={share}><ChatScreenShareView chatId="fixture-chat" authToken="fixture-token" /></ScreenShareProvider>
  </main>,
)
