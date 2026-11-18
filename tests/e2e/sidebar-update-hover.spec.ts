import { test, expect } from '@playwright/test'
import path from 'node:path'
import { registerAgentTestUser } from './helpers/agent-user'

const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'

for (const collapsed of [false, true]) {
  test(`update notes open outside the ${collapsed ? 'collapsed' : 'expanded'} sidebar`, async ({ page, request }) => {
    const token = await registerAgentTestUser(request, API_URL, `update-hover-${Date.now()}`, 'update-hover-test-password')
    await page.route('**/api/update/check', route => route.fulfill({ json: {
      currentVersion: '1.0.0', latestVersion: '99.0.0', hasUpdate: true,
    } }))
    await page.route('**/api/update/changelog?*', route => route.fulfill({ json: { releases: [{
      version: '99.0.0', url: 'https://example.com/release',
      commits: [{ sha: 'fixture', message: 'Sidebar hover regression fixture' }],
    }] } }))
    await page.context().addCookies([{ name: 'jait_token', value: token, url: API_URL, httpOnly: true, sameSite: 'Lax' }])
    await page.addInitScript(({ token, api, collapsed }) => {
      localStorage.setItem('jait-auth-token', token)
      sessionStorage.setItem('jait-auth-token', token)
      localStorage.setItem('token', token)
      localStorage.setItem('jait-gateway-url', api)
      localStorage.setItem('jait.navigationSidebarCollapsed', String(collapsed))
    }, { token, api: API_URL, collapsed })
    await page.goto('/threads')
    const button = page.getByRole('button', { name: 'Update to v99.0.0' })
    await button.hover()
    const notes = page.getByRole('dialog', { name: "What's new in v99.0.0" })
    await expect(notes).toBeVisible()
    const sidebar = await page.getByRole('complementary', { name: 'Workspace sidebar' }).boundingBox()
    const bounds = await notes.boundingBox()
    expect(sidebar).not.toBeNull()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(sidebar!.x + sidebar!.width)
    const viewport = page.viewportSize()!
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
    // A portaled panel remains usable after crossing from the update button.
    await notes.getByRole('link', { name: 'GitHub' }).hover()
    await expect(notes).toBeVisible()
    const linkBounds = await notes.getByRole('link', { name: 'GitHub' }).boundingBox()
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('a')?.textContent?.includes('GitHub'), {
      x: linkBounds!.x + linkBounds!.width / 2, y: linkBounds!.y + linkBounds!.height / 2,
    })).toBe(true)
    await page.screenshot({ path: path.resolve(__dirname, `../../.jait/shots/update-hover-${collapsed ? 'collapsed' : 'expanded'}.png`), fullPage: true })
    await page.keyboard.press('Escape')
    await expect(notes).toBeHidden()
    await button.focus()
    await expect(notes).toBeVisible()
    await page.getByRole('button', { name: collapsed ? 'Expand sidebar' : 'Collapse sidebar' }).focus()
    await expect(notes).toBeHidden()
  })
}
