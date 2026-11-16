import { expect, test } from '@playwright/test'

test('panel footer shows account usage and the composer offers an independent desktop reasoning select', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 844 })
  await page.route(/\/api\/providers(?:\?|$)/, route => route.fulfill({ json: {
    providers: [{ id: 'codex-1', providerType: 'codex', name: 'Codex Personal', available: true, modes: ['full-access'], nodeId: 'gateway' }], remoteProviders: [],
  } }))
  await page.route('**/api/providers/*/models*', route => route.fulfill({ json: { models: [
    { id: 'first', name: 'First model', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'ultra' }] },
  ] } }))
  const quota = (accountId: string, rateLimitType: string, utilization: number) => ({ accountId, providerType: 'codex', rateLimitType, utilization, updatedAt: '2026-01-01T00:00:00Z', models: [], credits: null })
  await page.route('**/api/provider-usage/summary*', route => route.fulfill({ json: { generatedAt: '2026-01-01T00:00:00Z', profiles: [
    { id: 'other', providerType: 'codex', providerLabel: 'Codex', profileLabel: 'Other', locationLabel: 'Gateway', error: null, quotas: [quota('other', 'five_hour', 0.99)] },
    { id: 'codex-1', providerType: 'codex', providerLabel: 'Codex', profileLabel: 'Personal', locationLabel: 'Gateway', error: null, quotas: [quota('codex-1', 'five_hour', 0.1), quota('codex-1', 'seven_day', 0.3)] },
  ] } }))
  await page.route('**/api/auth/refresh', route => route.fulfill({ json: { access_token: 'footer-fixture-token' } }))
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'fixture', username: 'fixture' } }))
  await page.route('**/api/settings', route => route.fulfill({ json: {} }))
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/chat-footer-controls.tsx'))

  const usage = page.getByLabel('Provider usage: session 10% weekly 30%', { exact: true })
  await expect(usage).toBeVisible()
  await expect(usage).toContainText('D 10%')
  await expect(usage).toContainText('W 30%')
  const effort = page.getByRole('combobox', { name: 'Reasoning effort' })
  await expect(effort).toBeVisible()
  await expect(effort).toHaveText('Default')
  await expect(effort.locator('svg.lucide-brain')).toHaveCount(1)
  await effort.click()
  await page.getByRole('option', { name: 'Ultra' }).click()
  await expect(effort).toHaveText('Ultra')
  // The selector row scrolls horizontally; leave room for focus indicators on
  // every side and keep the keyboard ring inside the selected control.
  const ringClearance = await effort.evaluate(element => {
    const row = element.closest('.overflow-x-auto')!
    const control = element.getBoundingClientRect()
    const bounds = row.getBoundingClientRect()
    return { top: control.top - bounds.top, bottom: bounds.bottom - control.bottom }
  })
  expect(ringClearance.top).toBeGreaterThanOrEqual(4)
  expect(ringClearance.bottom).toBeGreaterThanOrEqual(4)
  await effort.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(effort).toBeFocused()
  expect(await effort.evaluate(element => getComputedStyle(element).getPropertyValue('--tw-ring-inset').trim())).toBe('inset')
  expect(await page.getByTestId('chat-composer').evaluate(element => getComputedStyle(element).getPropertyValue('--tw-ring-inset').trim())).toBe('inset')
  await expect(page.getByRole('button', { name: /^Provider Codex/ })).toBeVisible()

  await expect(page.getByTestId('composer').getByLabel('Provider usage: session 10% weekly 30%')).toHaveCount(0)
  await expect(page.getByTestId('panel-footer').getByLabel('Provider usage: session 10% weekly 30%')).toBeVisible()
  await page.getByTestId('panel').evaluate(element => { element.style.width = '260px' })
  await expect(usage).toBeVisible()
})


test('mobile reasoning selector renders its selected value once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route(/\/api\/providers(?:\?|$)/, route => route.fulfill({ json: {
    providers: [{ id: 'codex-1', providerType: 'codex', name: 'Codex Personal', available: true, modes: ['full-access'], nodeId: 'gateway' }], remoteProviders: [],
  } }))
  await page.route('**/api/providers/*/models*', route => route.fulfill({ json: { models: [
    { id: 'first', name: 'First model', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'ultra' }] },
  ] } }))
  await page.route('**/api/auth/refresh', route => route.fulfill({ json: { access_token: 'footer-fixture-token' } }))
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'fixture', username: 'fixture' } }))
  await page.route('**/api/settings', route => route.fulfill({ json: {} }))
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/chat-footer-controls.tsx'))

  const effort = page.getByRole('combobox', { name: 'Reasoning effort' })
  await expect(effort).toHaveCount(1)
  await expect(effort).toHaveText('Default')
  await expect(effort.locator('svg.lucide-brain')).toHaveCount(1)
  await effort.click()
  await page.getByRole('option', { name: 'Ultra' }).click()
  await expect(effort).toHaveText('Ultra')
})
