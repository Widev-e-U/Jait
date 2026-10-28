import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { useScreenShare } from '@/hooks/useScreenShare'

const canvas = document.createElement('canvas')
canvas.width = 320
canvas.height = 180
const context = canvas.getContext('2d')!
let count = 0
setInterval(() => {
  context.fillStyle = count++ % 2 ? '#4bbb60' : '#6a55dd'
  context.fillRect(0, 0, canvas.width, canvas.height)
}, 100)
Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
  configurable: true,
  value: async () => canvas.captureStream(10),
})

function MediaFixture() {
  const share = useScreenShare({ token: 'fixture-token' })
  Reflect.set(window, 'disconnectFixtureShare', share.disconnect)
  return <>
    <Toaster />
    <video autoPlay muted playsInline data-testid="remote-video" ref={element => {
      if (element && element.srcObject !== share.remoteStream) {
        element.srcObject = share.remoteStream
        void element.play().catch(() => {})
      }
    }} />
    <output data-testid="status">{share.error ?? (share.remoteStream ? 'live' : 'waiting')}</output>
  </>
}
createRoot(document.getElementById('root')!).render(<MediaFixture />)
