import path from 'node:path'
import { test, expect } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'

test.describe('provider selector actions', () => {
  for (const mobile of [false, true]) {
    test(`${mobile ? 'touch hold' : 'right click'} refreshes models and logs out the targeted account`, async ({ page, request }) => {
      test.setTimeout(90_000)
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 })
      let loggedIn = true
      let refreshed = false
      let logoutCount = 0
      await page.route('**/api/providers*', async (route) => {
        const url = new URL(route.request().url())
        if (url.pathname !== '/api/providers') return route.fallback()
        await route.fulfill({ json: { providers: [
          { id: 'jait', name: 'Jait', available: true, modes: ['full-access'], nodeId: 'gateway' },
          { id: 'codex-test', providerType: 'codex', name: 'Test Codex', available: loggedIn, modes: ['full-access'], nodeId: 'gateway',
            unavailableReason: loggedIn ? undefined : 'Not authenticated',
            auth: { authenticated: loggedIn, login: true, logout: true, deviceCode: true } },
        ], remoteProviders: [] } })
      })
      await page.route('**/api/providers/*/models', (route) => route.fulfill({ json: {
        models: [{ id: refreshed ? 'fresh-model' : 'original-model', name: refreshed ? 'Fresh model' : 'Original model', isDefault: true }],
      } }))
      await page.route('**/api/providers/models/reset', async (route) => {
        refreshed = true
        await route.fulfill({ json: { ok: true } })
      })
      await page.route('**/api/providers/codex-test/auth/logout', async (route) => {
        loggedIn = false
        logoutCount += 1
        await route.fulfill({ json: { message: 'Test Codex logged out.' } })
      })

      const registration = await request.post(`${API_URL}/api/auth/register`, {
        data: { username: `provider-actions-${Date.now()}-${mobile}`, password: 'e2e-password-123' },
      })
      expect(registration.ok()).toBeTruthy()
      const { access_token: apiToken } = await registration.json()
      const headers = { Authorization: `Bearer ${apiToken}` }
      const projectResponse = await request.post(`${API_URL}/api/projects`, {
        headers, data: { rootPath: path.resolve(process.cwd(), '../..'), nodeId: 'gateway', title: 'Provider action test' },
      })
      expect(projectResponse.ok()).toBeTruthy()
      const project = await projectResponse.json()
      const sessionResponse = await request.post(`${API_URL}/api/projects/${project.id}/sessions`, {
        headers, data: { name: 'Provider actions' },
      })
      const session = await sessionResponse.json()
      await request.post(`${API_URL}/api/projects/select`, { headers, data: { projectId: project.id, sessionId: session.id } })
      await page.addInitScript(({ token, gateway }) => {
        localStorage.setItem('jait-auth-token', token)
        localStorage.setItem('jait-gateway-url', gateway)
      }, { token: apiToken, gateway: API_URL })
      const sessionRestored = page.waitForResponse((response) => response.url().includes(`/api/sessions/${session.id}/state?`))
      await page.goto('/')
      await sessionRestored
      await expect(page.getByRole('button', { name: 'Copy chat id' })).toBeVisible()
      await page.getByRole('button', { name: /^Provider .*model / }).first().click({ timeout: 30_000 })
      const account = page.getByRole('option', { name: /Test Codex/ })
      await expect(account.getByRole('img', { name: 'Ready to use' })).toBeVisible()
      await expect(account).not.toContainText('signed in')

      const openMenu = async () => {
        if (mobile) {
          await account.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, clientX: 40, clientY: 200 })
          await expect(page.getByRole('menuitem', { name: 'Refresh models' })).toBeVisible()
          await account.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true })
          await account.dispatchEvent('click')
        } else {
          await account.click({ button: 'right' })
        }
        await expect(page.getByRole('menuitem', { name: 'Refresh models' })).toBeVisible()
      }

      await openMenu()
      await expect(account).toHaveAttribute('aria-selected', 'false')
      await page.getByRole('menuitem', { name: 'Refresh models' }).click()
      await expect.poll(() => refreshed).toBe(true)
      await expect(account).toHaveAttribute('aria-selected', 'false')
      await account.click()
      await expect(account).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('option', { name: /Fresh model/ }).first()).toBeVisible()

      await openMenu()
      await page.getByRole('menuitem', { name: 'Log out' }).click()
      await expect.poll(() => logoutCount).toBe(1)
      await expect(account.getByRole('img', { name: 'Ready to use' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Login to Test Codex' })).toBeVisible()
      await expect(account).toHaveAttribute('aria-disabled', 'true')

      if (mobile) {
        await account.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, clientX: 40, clientY: 200 })
        await account.dispatchEvent('pointermove', { pointerType: 'touch', isPrimary: true, clientX: 40, clientY: 240 })
        await page.waitForTimeout(600)
        await expect(page.getByRole('menu')).toHaveCount(0)
        await account.dispatchEvent('pointercancel', { pointerType: 'touch', isPrimary: true })
      } else {
        await account.focus()
        await account.press('Shift+F10')
        await expect(page.getByRole('menuitem', { name: 'Refresh models' })).toBeDisabled()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('listbox', { name: 'Providers' })).toBeVisible()
      }
    })
  }
})
