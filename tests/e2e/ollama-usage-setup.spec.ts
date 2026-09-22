import { expect, test } from '@playwright/test'

for (const width of [1280, 390]) {
  test(`Ollama setup validates a key and refreshes usage at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    let saved = false
    let refreshes = 0
    await page.route('**/api/provider-usage/summary*', async route => {
      refreshes++
      await route.fulfill({ json: { generatedAt: new Date().toISOString(), profiles: [{
        id: 'jait-backend:ollama', providerType: 'ollama', providerLabel: 'Ollama', profileLabel: 'Ollama',
        locationLabel: 'Jait backend', accountLabel: 'test@example.com', planType: null,
        error: saved ? null : 'Device key is not readable',
        quotas: saved ? [{
          accountId: 'jait-backend:ollama', rateLimitType: 'seven_day', providerType: 'ollama', status: null,
          utilization: 0.1, resetsAt: null, isUsingOverage: false, updatedAt: new Date().toISOString(),
          planType: null, windowDurationMins: null, credits: null, models: [], activityCost: null,
        }] : [],
        ollamaSetup: { host: 'gateway-test', gatewayUser: 'jait', platform: 'linux', local: true, keyStatus: 'unreadable', keyPath: '/custom/key', permissionCommand: "sudo setfacl -m u:1234:r -- '/custom/key'" },
      }] } })
    })
    await page.route('**/api/provider-usage/ollama/api-key', async route => {
      saved = route.request().postDataJSON().apiKey === 'valid-test-key'
      await route.fulfill({ status: saved ? 200 : 400, json: saved ? { ok: true } : { error: 'Invalid test key. Saved settings have not changed.' } })
    })
    await page.goto('/')
    await page.evaluate(() => import('/src/e2e-fixtures/ollama-usage-setup.tsx'))
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Set up cloud usage', { exact: true })).toBeVisible()
    const input = dialog.getByLabel('Use an Ollama Cloud API key')
    await expect(input).toHaveAttribute('type', 'password')
    await expect(dialog.getByRole('link', { name: 'Create a key in Ollama' })).toHaveAttribute('href', 'https://ollama.com/settings/keys')
    await dialog.getByText('Use an existing Ollama login', { exact: true }).click()
    await expect(dialog.getByText('gateway-test', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Copy command' })).toBeVisible()
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await dialog.getByRole('button', { name: 'Test connection', exact: true }).click()
    await expect.poll(() => refreshes).toBeGreaterThan(1)
    await input.fill('bad-test-key')
    await dialog.getByRole('button', { name: 'Save and test' }).click()
    await expect(dialog.getByRole('status')).toContainText('Invalid test key')
    await input.fill('  valid-test-key  ')
    await dialog.getByRole('button', { name: 'Save and test' }).click()
    await expect(dialog.getByRole('status')).toContainText('Connected — cloud usage is up to date.')
    await expect(input).toHaveCount(0)
  })
}
