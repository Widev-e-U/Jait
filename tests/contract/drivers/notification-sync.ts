// Transport fixture only: Rust owns the expected outcomes.
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../../packages/gateway/package.json', import.meta.url))
const { default: WebSocket } = await import(require.resolve('ws'))
const { SignJWT } = await import(require.resolve('jose'))
import { WsControlPlane } from '../../../packages/gateway/src/ws'

const deadline = setTimeout(() => process.exit(2), 15000)
console.log = (...args) => console.error(...args)
const secret = 'notification-sync-isolated-contract-secret'
const plane = new WsControlPlane({ jwtSecret: secret, corsOrigin: '*', wsPort: 0 } as any)
plane.canAccessSession = (sid, user) => sid === 'owned-chat' && user === 'owner'
const pushes: unknown[] = []
plane.onChatNotificationRead = (state: unknown, user: string) => { pushes.push({ state, user }) }
const server = createServer()
plane.start(server)
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const port = (server.address() as { port: number }).port
const sockets: InstanceType<typeof WebSocket>[] = []

async function peer(user?: string) {
  const token = user ? await new SignJWT({}).setSubject(user).setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h').sign(new TextEncoder().encode(secret)) : ''
  const socket = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}&surface=mobile`)
  sockets.push(socket)
  const messages: any[] = []
  socket.on('message', raw => messages.push(JSON.parse(raw.toString())))
  await once(socket, 'open')
  const wait = async (predicate: (event: any) => boolean) => {
    const until = Date.now() + 2000
    while (!messages.some(predicate)) {
      if (Date.now() > until) throw new Error('fixture event timeout')
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    return messages.find(predicate)
  }
  await wait(e => e.type === 'session.created')
  return { socket, messages, wait, send: (msg: unknown) => socket.send(JSON.stringify(msg)) }
}
let seq = 0
async function barrier(p: Awaited<ReturnType<typeof peer>>) {
  const resource = 'barrier-' + ++seq
  p.send({ type: 'resource.subscribe', payload: { resource } })
  await p.wait(e => e.type === 'error' && e.payload.message === 'Unknown resource: ' + resource)
}
function publish(id: string) {
  const notification = { id, sessionId: 'owned-chat', replaceId: 'chat-complete:owned-chat',
    kind: 'completion', title: 'Ready', body: 'Done' }
  // The fallback lets this same repro observe the pre-fix missing read broadcast.
  if (typeof plane.publishChatNotification === 'function') plane.publishChatNotification('owner', notification)
  else plane.broadcastToUser('owner', { type: 'notification', sessionId: 'owned-chat', timestamp: new Date().toISOString(), payload: notification })
}
try {
  const reader = await peer('owner')
  const phone = await peer('owner')
  const other = await peer('other')
  publish('completion-1')
  await phone.wait(e => e.type === 'notification')
  const read = { type: 'notification.read', sessionId: 'owned-chat', payload: { id: 'completion-1' } }
  other.send(read)
  await barrier(other)
  reader.send(read)
  await barrier(reader)
  await barrier(phone)
  await barrier(other)
  const afterRead = { phone: [...phone.messages], other: [...other.messages], pushes: [...pushes] }
  publish('completion-2')
  reader.send(read) // Late acknowledgement of the previous reply must do nothing.
  await barrier(reader)
  await barrier(phone)
  const afterStale = { phone: [...phone.messages], pushes: [...pushes] }
  const resumed = await peer('owner')
  resumed.send({ type: 'resource.subscribe', payload: { resource: 'root:/chat-notifications' } })
  await barrier(resumed)
  reader.send({ type: 'notification.read', sessionId: 'owned-chat', payload: { id: 'completion-2' } })
  await barrier(reader)
  reader.send({ type: 'notification.read', sessionId: 'owned-chat', payload: { id: 'completion-2' } })
  reader.send({ type: 'notification.read', sessionId: ['owned-chat'], payload: { id: 'completion-2' } })
  await barrier(reader)
  await barrier(phone)
  const reconnect = await peer('owner')
  reconnect.send({ type: 'resource.subscribe', payload: { resource: 'root:/chat-notifications' } })
  await barrier(reconnect)
  const anonymous = await peer()
  anonymous.send(read)
  await anonymous.wait(e => e.type === 'error')
  process.stdout.write(JSON.stringify({ afterRead, afterStale, resumed: resumed.messages,
    reconnect: reconnect.messages, final: phone.messages, pushes, anonymous: anonymous.messages }))
} finally {
  for (const socket of sockets) socket.terminate()
  plane.stop()
  server.close()
  clearTimeout(deadline)
}
