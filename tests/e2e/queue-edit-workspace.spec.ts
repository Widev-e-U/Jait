import path from 'node:path'
import { expect, test } from '@playwright/test'

for (const width of [320, 390, 1280]) {
  test(`queued editing keeps one mobile composer and restores the draft at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.route('**/api/**', route => route.fulfill({ json: { providers: [], models: [], skills: [], agents: [], projects: [], sessions: [] } }))
    await page.goto('/src/e2e-fixtures/queue-edit-workspace.html')
    await expect(page.getByRole('textbox')).toHaveText('Keep my unsent draft')
    const row = page.locator('[data-queue-id="queued-1"]')
    const edit = row.getByRole('button', { name: 'Edit message', exact: true })
    await edit.click()
    const editor = page.locator('[data-queue-editor]')
    await expect(editor.getByRole('textbox')).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveCount(width < 768 ? 1 : 2)
    if (width < 768) {
      const box = (await editor.boundingBox())!
      expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2)
      expect(Math.abs(box.y + box.height / 2 - 850 / 2)).toBeLessThan(2)
      await expect(page.getByTestId('normal-composer-controls')).toHaveCount(0)
      await expect(editor.getByRole('textbox')).toBeFocused()
      await page.evaluate(() => {
        const viewport = window.visualViewport!
        Object.defineProperty(viewport, 'height', { configurable: true, value: 400 })
        Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: 50 })
        viewport.dispatchEvent(new Event('resize'))
      })
      await expect.poll(async () => {
        const box = (await editor.boundingBox())!
        return Math.abs(box.y + box.height / 2 - 250)
      }).toBeLessThan(2)
    }
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `queue-edit-workspace-${width}.png`) })
    await editor.getByRole('button', { name: 'Cancel editing message' }).click()
    await expect(editor).toHaveCount(0)
    await expect(page.getByRole('textbox')).toHaveText('Keep my unsent draft')
    await edit.click()
    await editor.getByRole('textbox').fill('Changed queued message')
    await editor.getByRole('button', { name: 'Send message', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await expect(row).toContainText('Changed queued message')
    await expect(page.getByRole('textbox')).toHaveText('Keep my unsent draft')
    await edit.click()
    await page.getByRole('button', { name: 'Remove queued item externally' }).click()
    await expect(editor).toHaveCount(0)
    await expect(page.getByRole('textbox')).toHaveText('Keep my unsent draft')
  })
}


for (const retryMode of ['inline', 'footer']) {
  test(`provider 502 ${retryMode} error offers one retry and restores it after failure`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 850 })
    await page.route('**/api/**', route => route.fulfill({ json: { providers: [], models: [], skills: [], agents: [], projects: [], sessions: [] } }))
    await page.goto(`/src/e2e-fixtures/queue-edit-workspace.html?retry=${retryMode}`)
    const retry = page.getByRole('button', { name: 'Retry', exact: true })
    await expect(retry).toHaveCount(1)
    await expect(retry).toBeEnabled()
    await retry.click()
    const calls = page.getByTestId('retry-calls')
    await expect(calls).toContainText('fixture-token')
    await expect(calls).toContainText('queue-edit-fixture')
    await expect.poll(async () => JSON.parse(await calls.innerText()).length).toBe(1)
    if (retryMode === 'inline') await expect(retry).toBeDisabled()
    else await expect(retry).toHaveCount(0)
    await page.getByRole('button', { name: 'Fail retry', exact: true }).click()
    await expect(retry).toBeEnabled()
    await retry.click()
    await expect.poll(async () => JSON.parse(await calls.innerText()).length).toBe(2)
    await page.getByRole('button', { name: 'Complete retry', exact: true }).click()
    await expect(page.getByText('Continued successfully', { exact: true })).toBeVisible()
    await expect(retry).toHaveCount(0)
    await expect(page.getByRole('textbox')).toHaveText('Keep my unsent draft')
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `provider-error-retry-${retryMode}.png`) })
  })
}
