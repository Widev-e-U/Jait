import { expect, type APIRequestContext } from '@playwright/test'

/** Keep each test isolated while exercising the gateway's owner invitation policy. */
export async function registerTestUser(request: APIRequestContext, api: string, options: { data: { username: string; password: string } }) {
  const credentials = { username: 'e2e-agent-owner', password: 'e2e-owner-test-password' }
  const bootstrap = await request.post(api + '/api/auth/register', { data: credentials })
  const owner = bootstrap.ok() ? bootstrap : await request.post(api + '/api/auth/login', { data: credentials })
  expect(owner.ok(), 'Use a fresh E2E gateway with the test owner account').toBeTruthy()
  const { access_token: ownerToken } = await owner.json()
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(api.replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(ownerToken))
    const timer = setTimeout(() => { socket.close(); reject(new Error('E2E gateway permission setup timed out')) }, 5000)
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data))
      if (message.type === 'session.created' && message.payload?.authenticated) socket.send(JSON.stringify({ type: 'nodes.update-permissions', payload: { nodeId: 'gateway', grants: { filesystem: true, terminal: true, browser: true, agent: true } } }))
      if (message.type === 'nodes.permissions' && message.payload?.nodes?.some((node: { id: string; permissions: { filesystem: boolean } }) => node.id === 'gateway' && node.permissions.filesystem)) {
        clearTimeout(timer); socket.close(); resolve()
      }
      if (message.type === 'error') { clearTimeout(timer); socket.close(); reject(new Error(message.payload?.message ?? 'Gateway permission setup failed')) }
    })
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Gateway permission setup socket failed')) })
  })
  const invited = await request.post(api + '/api/auth/invitations', { headers: { Authorization: `Bearer ${ownerToken}` } })
  expect(invited.ok()).toBeTruthy()
  const { invitation } = await invited.json()
  return request.post(api + '/api/auth/register', { data: { ...options.data, invitation } })
}

export async function registerAgentTestUser(request: APIRequestContext, api: string, username: string, password: string): Promise<string> {
  const registration = await registerTestUser(request, api, { data: { username, password } })
  expect(registration.ok()).toBeTruthy()
  return (await registration.json()).access_token
}
