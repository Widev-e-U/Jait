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
  const registerResponse = await page.request.post(`${API_URL}/auth/register`, {
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

  const loginResponse = await page.request.post(`${API_URL}/auth/login`, {
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
  await page.goto('/')
  await page.evaluate((storedToken) => {
    localStorage.setItem('token', storedToken)
  }, token)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
}

async function loginThroughUi(page: Page, identity: TestAuthIdentity): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Account' })
  if (!(await dialog.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Sign in' }).click()
  }

  await page.getByRole('textbox', { name: 'Username' }).fill(identity.username)
  await page.getByRole('textbox', { name: 'Password' }).fill(identity.password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(dialog).not.toBeVisible({ timeout: 15000 })
}

export async function cleanupTestJobs(page: Page, token: string): Promise<void> {
  let apiContext: Awaited<ReturnType<typeof playwrightRequest.newContext>> | null = null
  try {
    apiContext = await playwrightRequest.newContext()
    const listResponse = await apiContext.get(`${API_URL}/jobs?include_disabled=true`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!listResponse.ok()) return

    const data = await listResponse.json() as { items?: Array<{ id: string }> }
    for (const job of data.items ?? []) {
      await apiContext.delete(`${API_URL}/jobs/${job.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  } catch (error) {
    console.warn('Failed to cleanup test jobs:', error)
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
  authIdentity: async ({}, use, testInfo) => {
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

  authenticatedPage: async ({ page, apiToken, authIdentity }, use) => {
    try {
      await authenticatePage(page, apiToken)
      await page.waitForTimeout(300)
      if (await page.getByRole('button', { name: 'Sign in' }).isVisible().catch(() => false)) {
        await loginThroughUi(page, authIdentity)
      }
      await use(page)
    } catch (error) {
      console.warn('Auth setup failed, tests may fail:', error)
      await use(page)
    } finally {
      await cleanupTestJobs(page, apiToken)
    }
  },
})

export { expect }
