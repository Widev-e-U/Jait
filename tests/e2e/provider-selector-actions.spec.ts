import { registerTestUser } from './helpers/agent-user'
import path from 'node:path'
import { test, expect } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'

test.describe('provider selector actions', () => {
  let apiToken: string
  test.beforeAll(async ({ request }) => {
    test.setTimeout(90_000)
    const registration = await registerTestUser(request, API_URL, {
      data: { username: `provider-actions-${Date.now()}`, password: 'e2e-password-123' },
    })
    expect(registration.ok()).toBeTruthy()
    apiToken = (await registration.json()).access_token
  })
  for (const mobile of [false, true]) {
    test(`${mobile ? 'touch hold' : 'right click'} refreshes models and logs out the targeted account`, async ({ page, request }) => {
      test.setTimeout(90_000)
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 })
      let loggedIn = true
      let refreshed = false
      let logoutCount = 0
      let updated = false
      let finishUpdate!: () => void
      const updatePending = new Promise<void>((resolve) => { finishUpdate = resolve })
      await page.route('**/api/providers*', async (route) => {
        const url = new URL(route.request().url())
        if (url.pathname !== '/api/providers') return route.fallback()
        await route.fulfill({ json: { providers: [
          { id: 'jait', name: 'Jait', available: true, modes: ['full-access'], nodeId: 'gateway' },
          { id: 'codex-test', providerType: 'codex', name: 'Test Codex', available: loggedIn, modes: ['full-access'], nodeId: 'gateway',
            unavailableReason: loggedIn ? undefined : 'Not authenticated',
            update: { currentVersion: updated ? '2.0.0' : '1.0.0', latestVersion: '2.0.0', updateAvailable: !updated, checkedAt: new Date().toISOString() },
            auth: { authenticated: loggedIn, login: true, logout: true, deviceCode: true } },
        ], remoteProviders: [] } })
      })
      await page.route('**/api/providers/*/models', (route) => route.fulfill({ json: {
        models: [{ id: refreshed ? 'fresh-model' : 'original-model', name: refreshed ? 'Fresh model' : 'Original model', isDefault: true,
          ...(refreshed ? { supportedReasoningEfforts: ['low', 'high', 'max'].map((reasoningEffort) => ({ reasoningEffort })) } : {}) }],
      } }))
      await page.route('**/api/providers/models/reset', async (route) => {
        refreshed = true
        await route.fulfill({ json: { ok: true } })
      })
      await page.route('**/api/providers/codex-test/update', async (route) => {
        await updatePending
        if (mobile) {
          await route.fulfill({ status: 500, json: { error: 'Test Codex update failed.' } })
        } else {
          updated = true
          await route.fulfill({ json: { ok: true, message: 'Test Codex updated.', currentVersion: '2.0.0', latestVersion: '2.0.0', updateAvailable: false, checkedAt: new Date().toISOString() } })
        }
      })
      await page.route('**/api/providers/codex-test/auth/logout', async (route) => {
        loggedIn = false
        logoutCount += 1
        await route.fulfill({ json: { message: 'Test Codex logged out.' } })
      })

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
      await page.context().addCookies([{ name: 'jait_token', value: apiToken, url: API_URL, httpOnly: true, sameSite: 'Lax' }])
  await page.addInitScript(({ token, gateway }) => {
        localStorage.setItem('jait-auth-token', token)
        localStorage.setItem('jait-gateway-url', gateway)
      }, { token: apiToken, gateway: API_URL })
      const sessionRestored = page.waitForResponse((response) => response.url().includes(`/api/sessions/${session.id}/state?`))
      await page.goto('/')
      await sessionRestored
      await expect(page.getByRole('button', { name: 'Copy chat id' })).toBeVisible()
      const providerSelector = page.getByRole('button', { name: /^Provider .*model / }).first()
      await expect(providerSelector).not.toContainText('Gateway')
      await expect(providerSelector).not.toHaveAttribute('aria-label', /reasoning/)
      if (!mobile) {
        await providerSelector.click({ button: 'right', timeout: 30_000 })
        await expect(page.getByRole('menuitem', { name: 'Refresh models' })).toBeVisible()
        await page.keyboard.press('Escape')
      }
      await providerSelector.click({ timeout: 30_000 })
      const providers = page.getByRole('listbox', { name: 'Providers' })
      await providers.getByRole('option', { name: 'Jait', exact: true }).click()
      const account = providers.getByRole('option', { name: /Test Codex/ })
      // The green "Ready to use" checkmark was removed from provider rows —
      // availability is now communicated only by the disabled state + reason text.
      await expect(account.getByRole('img', { name: 'Ready to use' })).toHaveCount(0)
      await expect(account).not.toContainText('signed in')

      await page.getByRole('button', { name: 'Update Test Codex to 2.0.0' }).click()
      const updateButton = page.getByRole('button', { name: 'Updating Test Codex', exact: true })
      await expect(updateButton).toHaveAttribute('aria-busy', 'true')
      await expect(updateButton.locator('svg')).toHaveClass(/animate-spin/)
      await expect(page.getByRole('listbox', { name: 'Providers' })).not.toContainText('Installing')
      const notification = page.locator('[data-sonner-toast]').filter({ hasText: 'Installing Test Codex CLI 2.0.0' })
      await expect(notification).toBeVisible()
      const notificationId = await notification.getAttribute('data-index')
      finishUpdate()
      const completedNotification = page.locator('[data-sonner-toast]').filter({ hasText: mobile ? 'Test Codex update failed.' : 'Test Codex updated.' })
      await expect(completedNotification).toBeVisible()
      expect(await completedNotification.getAttribute('data-index')).toBe(notificationId)
      await expect(page.getByRole('button', { name: 'Updating Test Codex', exact: true })).toHaveCount(0)

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
      await page.keyboard.press('Escape')
      await expect(providerSelector).toHaveAttribute('aria-label', /reasoning Default/)
      for (const effort of ['Low', 'High', 'Max']) {
        await providerSelector.click()
        await page.getByRole('button', { name: effort, exact: true }).click()
        // The pill collapses to an icon-only button in compact (mobile) layouts,
        // so selection state is asserted via the aria-label, which carries it for both layouts.
        await expect(providerSelector).toHaveAttribute('aria-label', new RegExp(`reasoning ${effort}`))
        if (!mobile) {
          await expect(providerSelector).toContainText(effort)
        }
        await expect(providerSelector).not.toContainText('Gateway')
      }
      await providerSelector.click()

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
