import { expect, test } from '@playwright/test'
for (const width of [1280, 390]) {
  test(`Ollama session setup and Go windows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    let connected = false
    const quota = (providerType: string, rateLimitType: string, utilization: number) => ({
      accountId: providerType, providerType, rateLimitType, utilization, resetsAt: '2026-10-15T10:00:00Z',
      updatedAt: new Date().toISOString(), models: [], credits: null,
    })
    await page.route('**/api/provider-usage/summary*', route => route.fulfill({ json: {
      generatedAt: new Date().toISOString(), profiles: [
        { id: 'ollama', providerType: 'ollama', providerLabel: 'Ollama', profileLabel: 'Ollama', locationLabel: 'Jait backend',
          error: connected ? null : 'Browser session needed', quotas: connected ? [quota('ollama', 'five_hour', 0.42), quota('ollama', 'seven_day', 0.81)] : [],
        },
        { id: 'go', providerType: 'opencode-go', providerLabel: 'OpenCode Go', profileLabel: 'OpenCode Go', locationLabel: 'Jait backend', error: null,
          quotas: [quota('opencode-go', 'five_hour', 0.2), quota('opencode-go', 'seven_day', 0.5), quota('opencode-go', 'monthly', 0.7)],
        },
      ],
    } }))
    await page.route('**/api/provider-usage/ollama/session', async route => {
      connected = route.request().postDataJSON().session === 'valid-private-session'
      await route.fulfill({ status: connected ? 200 : 400, json: connected ? { ok: true } : { error: 'Browser session expired.' } })
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => import('/src/e2e-fixtures/ollama-usage-setup.tsx'))
    const dialog = page.getByRole('dialog')
    const input = dialog.getByLabel('Ollama browser session')
    await expect(input).toHaveAttribute('type', 'password')
    await input.fill('expired')
    await dialog.getByRole('button', { name: 'Save and test session', exact: true }).click()
    await expect(dialog.getByRole('status')).toContainText('Browser session expired')
    await input.fill('valid-private-session')
    await dialog.getByRole('button', { name: 'Save and test session', exact: true }).click()
    await expect(dialog.getByText('42% used', { exact: true })).toBeVisible()
    await expect(dialog.getByText('81% used', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: /^OpenCode Go/ }).click()
    await expect(dialog.getByText('20% used', { exact: true })).toBeVisible()
    await expect(dialog.getByText('50% used', { exact: true })).toBeVisible()
    await expect(dialog.getByText('70% used', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: /^Ollama Ollama/ }).click()
    await dialog.getByText('Manage Ollama usage connection', { exact: true }).click()
    await expect(input).toHaveValue('')
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  })
}
