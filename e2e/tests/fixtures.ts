/**
 * E2E test fixtures for authentication and common setup
 */
import { test as base, expect, Page } from '@playwright/test'

// API base URL
const API_URL = process.env.API_URL || 'http://localhost:8000'

// Test user data
export const TEST_USER = {
  id: 'e2e-test-user-123',
  email: 'e2e-test@example.com',
  name: 'E2E Test User',
  picture: 'https://example.com/avatar.jpg',
}

/**
 * Create a test token via the backend test endpoint
 */
export async function getTestToken(page: Page): Promise<string> {
  const response = await page.request.post(`${API_URL}/auth/test/token`, {
    data: TEST_USER,
  })
  
  if (!response.ok()) {
    throw new Error(`Failed to get test token: ${await response.text()}`)
  }
  
  const data = await response.json()
  return data.access_token
}

/**
 * Authenticate a page by setting the auth state
 */
export async function authenticatePage(page: Page, token: string): Promise<void> {
  // Set localStorage before navigation
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token)
    // Also set user info if needed by the app immediately
  }, { token, user: TEST_USER })
}

/**
 * Clean up test jobs after tests
 */
export async function cleanupTestJobs(page: Page, token: string): Promise<void> {
  try {
    // List all jobs for the test user and delete them
    const listResponse = await page.request.get(`${API_URL}/jobs?include_disabled=true`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    if (listResponse.ok()) {
      const data = await listResponse.json()
      for (const job of data.items) {
        await page.request.delete(`${API_URL}/jobs/${job.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      }
    }
  } catch (error) {
    console.warn('Failed to cleanup test jobs:', error)
  }
}

// Extended test interface with fixtures
interface JobsFixtures {
  authenticatedPage: Page
  apiToken: string
}

/**
 * Extended test with authentication fixture
 */
export const test = base.extend<JobsFixtures>({
  authenticatedPage: async ({ page }, use) => {
    try {
      const token = await getTestToken(page)
      await authenticatePage(page, token)
      await use(page)
      await cleanupTestJobs(page, token)
    } catch (error) {
      // If test endpoint not available, skip auth tests
      console.warn('Auth setup failed, tests may fail:', error)
      await use(page)
    }
  },
  
  apiToken: async ({ page }, use) => {
    const token = await getTestToken(page)
    await use(token)
  },
})

export { expect }
