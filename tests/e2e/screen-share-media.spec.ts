import { createServer } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { expect, test } from '@playwright/test'

test.use({ screenshot: 'off' })

test('two viewers receive real WebRTC frames and one can leave independently', async ({ browser }) => {
  const server = createServer()
  const sockets = new WebSocketServer({ server })
  const participants = new Map<string, WebSocket>()
  const viewers = new Set(['viewer-a', 'viewer-b'])
  const snapshot = () => ({
    id: 'fixture-share', status: 'sharing', hostDeviceId: 'host',
    viewers: [...viewers].map(deviceId => ({ deviceId })), chatId: 'fixture-chat',
    pendingApproval: false, initiatedBy: 'agent', controlOwner: 'user',
  })
  const send = (id: string, message: unknown) => {
    const socket = participants.get(id)
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }
  sockets.on('connection', socket => {
    let deviceId = ''
    socket.on('message', raw => {
      const message = JSON.parse(raw.toString()) as { type: string; deviceId?: string; payload?: Record<string, unknown> }
      if (message.type === 'subscribe') {
        deviceId = message.deviceId ?? ''
        participants.set(deviceId, socket)
        return
      }
      if (!message.type.startsWith('screen-share:') || !message.payload) return
      const target = deviceId === 'host' ? message.payload.toDeviceId : 'host'
      if (typeof target === 'string') send(target, message)
    })
    socket.on('close', () => { if (participants.get(deviceId) === socket) participants.delete(deviceId) })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test signaling address')
  const gateway = `http://127.0.0.1:${address.port}`
  const contexts = await Promise.all(['host', 'viewer-a', 'viewer-b'].map(async id => {
    const context = await browser.newContext()
    await context.addInitScript(({ gateway, id }) => {
      localStorage.setItem('jait-gateway-url', gateway)
      localStorage.setItem('jait-device-id-web', id)
      const NativeWebSocket = window.WebSocket
      class FixtureWebSocket extends NativeWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          const target = String(url).includes('fixture-token') ? gateway.replace(/^http/, 'ws') : url
          super(target, protocols)
        }
      }
      window.WebSocket = FixtureWebSocket
    }, { gateway, id })
    await context.route('**/api/screen-share/**', route => {
      const request = route.request()
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type',
      }
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
      const path = new URL(request.url()).pathname
      if (path.endsWith('/leave')) {
        viewers.delete(request.postDataJSON().viewerDeviceId)
        for (const id of participants.keys()) send(id, { type: 'screen-share:state-update', payload: snapshot() })
      }
      if (path.endsWith('/stop')) {
        for (const id of participants.keys()) send(id, { type: 'screen-share:state-update', payload: { ...snapshot(), status: 'idle' } })
      }
      const body = path.endsWith('/approve') ? { session: snapshot() } : { devices: [], activeSession: null }
      return route.fulfill({ json: body, headers })
    })
    const page = await context.newPage()
    page.on('pageerror', error => console.error(`[${id}] page error: ${error.message}`))
    await page.goto('/screen-share-media-repro.html')
    return { context, page }
  }))
  const [host, a, b] = contexts
  try {
    await expect.poll(() => participants.size).toBe(3)
    const request = { type: 'screen-share:start-request', payload: {
      sessionId: 'fixture-share', hostDeviceId: 'host', viewerDeviceIds: ['viewer-a', 'viewer-b'],
      chatId: 'fixture-chat', initiatedBy: 'agent', requireConsent: true,
    } }
    for (const id of ['host', 'viewer-a', 'viewer-b']) send(id, request)
    await host!.page.getByRole('button', { name: 'Approve' }).click()
    for (const { page } of [a!, b!]) {
      const video = page.getByTestId('remote-video')
      await expect(page.getByTestId('status')).toHaveText('live', { timeout: 20000 })
      await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).videoWidth), { timeout: 20000 }).toBe(320)
      await expect.poll(() => video.evaluate(element => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')!
        context.drawImage(element as HTMLVideoElement, 0, 0, 1, 1)
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).some(channel => channel > 0)
      }), { timeout: 20000 }).toBe(true)
    }
    const before = await b!.page.getByTestId('remote-video').evaluate(element => (element as HTMLVideoElement).currentTime)
    await a!.page.evaluate(() => (Reflect.get(window, 'disconnectFixtureShare') as () => Promise<void>)())
    await expect.poll(() => viewers.has('viewer-a')).toBe(false)
    await expect.poll(() => b!.page.getByTestId('remote-video').evaluate(element => (element as HTMLVideoElement).currentTime))
      .toBeGreaterThan(before)
    await host!.page.evaluate(() => (Reflect.get(window, 'disconnectFixtureShare') as () => Promise<void>)())
    await expect(b!.page.getByTestId('status')).toHaveText('waiting')
  } finally {
    await Promise.all(contexts.map(({ context }) => context.close()))
    for (const socket of sockets.clients) socket.terminate()
    await new Promise<void>(resolve => sockets.close(() => resolve()))
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
