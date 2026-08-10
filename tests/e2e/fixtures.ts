/**
 * E2E test fixtures for authentication and common setup
 */
import { test as base, expect, request as playwrightRequest, Page } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'
const TEST_PASSWORD = 'e2e-password-123'

export const TEST_USER = {
  id: 'e2e-test-user-123',
  email: 'e2e-test@example.com',
  name: 'E2E Test User',
  picture: 'https://example.com/avatar.jpg',
}

interface TestAuthIdentity {
  username: string
  password: string
}

export async function getTestToken(page: Page, identity: TestAuthIdentity): Promise<string> {
  const registerResponse = await page.request.post(`${API_URL}/api/auth/register`, {
    data: {
      username: identity.username,
      password: identity.password,
    },
  })

  if (registerResponse.ok()) {
    const data = await registerResponse.json()
    return data.access_token
  }

  if (registerResponse.status() !== 409) {
    throw new Error(`Failed to register test user: ${await registerResponse.text()}`)
  }

  const loginResponse = await page.request.post(`${API_URL}/api/auth/login`, {
    data: {
      username: identity.username,
      password: identity.password,
    },
  })

  if (!loginResponse.ok()) {
    throw new Error(`Failed to log in test user: ${await loginResponse.text()}`)
  }

  const data = await loginResponse.json()
  return data.access_token
}

export async function authenticatePage(page: Page, token: string): Promise<void> {
  await page.addInitScript((storedToken) => {
    localStorage.setItem('jait-auth-token', storedToken)
  }, token)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sign in' })).not.toBeVisible({ timeout: 15000 })
}

export async function cleanupTestJobs(token: string): Promise<void> {
  let apiContext: Awaited<ReturnType<typeof playwrightRequest.newContext>> | null = null
  try {
    apiContext = await playwrightRequest.newContext()
    const listResponse = await apiContext.get(`${API_URL}/api/jobs?include_disabled=true`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!listResponse.ok()) {
      throw new Error(`Failed to list test jobs: HTTP ${listResponse.status()} ${await listResponse.text()}`)
    }

    const data = await listResponse.json() as { items?: Array<{ id: string }> }
    for (const job of data.items ?? []) {
      const deleteResponse = await apiContext.delete(`${API_URL}/api/jobs/${job.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!deleteResponse.ok()) {
        throw new Error(`Failed to delete test job ${job.id}: HTTP ${deleteResponse.status()} ${await deleteResponse.text()}`)
      }
    }
  } finally {
    await apiContext?.dispose()
  }
}

interface JobsFixtures {
  authIdentity: TestAuthIdentity
  authenticatedPage: Page
  apiToken: string
}

export const test = base.extend<JobsFixtures>({
  authIdentity: async (_fixtures, use, testInfo) => {
    const suffix = `${testInfo.parallelIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await use({
      username: `e2e-${suffix}`,
      password: TEST_PASSWORD,
    })
  },

  apiToken: async ({ page, authIdentity }, use) => {
    const token = await getTestToken(page, authIdentity)
    await use(token)
  },

  authenticatedPage: async ({ page, apiToken }, use) => {
    await authenticatePage(page, apiToken)
    await use(page)
  },
})

export { expect }
