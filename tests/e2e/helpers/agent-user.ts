import { expect, type APIRequestContext } from '@playwright/test'

/** Keep each test isolated while exercising the gateway's owner invitation policy. */
export async function registerAgentTestUser(request: APIRequestContext, api: string, username: string, password: string): Promise<string> {
  const credentials = { username: 'e2e-agent-owner', password: 'e2e-owner-test-password' }
  const bootstrap = await request.post(api + '/api/auth/register', { data: credentials })
  const owner = bootstrap.ok() ? bootstrap : await request.post(api + '/api/auth/login', { data: credentials })
  expect(owner.ok(), 'Use a fresh E2E gateway with the test owner account').toBeTruthy()
  const { access_token: ownerToken } = await owner.json()
  const invited = await request.post(api + '/api/auth/invitations', { headers: { Authorization: `Bearer ${ownerToken}` } })
  expect(invited.ok()).toBeTruthy()
  const { invitation } = await invited.json()
  const registration = await request.post(api + '/api/auth/register', { data: { username, password, invitation } })
  expect(registration.ok()).toBeTruthy()
  return (await registration.json()).access_token
}
