import path from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * Regression cover for the crowded provider list: long provider titles next to
 * the inline update/login action buttons, plus long model names. The plain
 * layout spec mocks providers without `auth`/`update`, so the action overlay —
 * the part that used to overlap the title on mobile — was never exercised.
 */

const providedAt = '2024-01-01T00:00:00.000Z'

const providers = [
  {
    id: 'codex',
    providerType: 'codex',
    name: 'Codex',
    available: true,
    installed: true,
    modes: ['full-access'],
    nodeId: 'gateway',
  },
  {
    id: 'codex-nightly',
    providerType: 'codex',
    name: 'Claude Code CLI (nightly, gateway build)',
    available: true,
    installed: true,
    modes: ['full-access'],
    nodeId: 'gateway',
    auth: { login: true, logout: true, deviceCode: false, authenticated: false },
    update: {
      currentVersion: '1.2.3',
      latestVersion: '9.9.9',
      updateAvailable: true,
      checkedAt: providedAt,
    },
  },
  {
    id: 'codex-alpha',
    providerType: 'codex',
    name: 'A very long provider title that would normally be clipped',
    available: true,
    installed: true,
    modes: ['full-access'],
    nodeId: 'gateway',
    auth: { login: true, logout: true, deviceCode: false, authenticated: false },
  },
]

const models = [
  { id: 'gpt-6.1', name: 'GPT-6.1', isDefault: true },
  { id: 'gpt-6.1-long', name: 'GPT-6.1 with an extended model name' },
  { id: 'gpt-6.1-longest', name: 'GPT-6.1 with an extremely long model name that keeps going' },
]

for (const width of [320, 390, 1280]) {
  test(`crowded provider rows stay separated at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.route(/\/api\/providers(?:\?|$)/, route => route.fulfill({ json: {
      providers, remoteProviders: [],
    } }))
    await page.route('**/api/providers/*/models*', route => route.fulfill({ json: { models } }))
    await page.route(url => url.pathname === '/', async route => {
      const response = await route.fetch()
      await route.fulfill({ response, body: (await response.text()).replace('/src/main.tsx', '/src/e2e-fixtures/provider-selector-layout.tsx') })
    })
    await page.route('**/api/auth/refresh', route => route.fulfill({ json: { access_token: 'layout-fixture-token' } }))
    await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'fixture', username: 'fixture' } }))
    await page.route('**/api/settings', route => route.fulfill({ json: {} }))
    await page.goto('/')

    await page.getByRole('button', { name: /^Provider Codex, model/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Provider and model', exact: true })
    const providersList = page.getByRole('listbox', { name: 'Providers', exact: true })
    const modelsList = page.getByRole('listbox', { name: 'Models', exact: true })
    await expect(providersList.getByRole('option')).toHaveCount(providers.length)

    // The action buttons must actually render, otherwise the overlap case is untested.
    const updateButtons = providersList.getByRole('button', { name: /^Update .* to 9\.9\.9$/ })
    const loginButtons = providersList.getByRole('button', { name: /^Login to / })
    await expect(updateButtons).toHaveCount(1)
    await expect(loginButtons).toHaveCount(2)

    // Mobile renders a Dialog; desktop renders a Popover with no dialog role.
    if (width < 768) {
      await expect(dialog).toBeVisible()
      await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    }

    const options = providersList.getByRole('option')
    const optionCount = await options.count()
    for (let index = 0; index < optionCount; index += 1) {
      const option = options.nth(index)
      const rowBox = await option.boundingBox()
      expect(rowBox, `provider row ${index} has a box`).not.toBeNull()

      // The title span must stay inside its row and never run under the actions.
      const label = option.locator('span.truncate, span[class*="overflow-wrap"]').first()
      const labelBox = await label.boundingBox()
      expect(labelBox, `provider row ${index} label has a box`).not.toBeNull()
      expect(labelBox!.x).toBeGreaterThanOrEqual(rowBox!.x - 1)
      expect(labelBox!.x + labelBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 1)

      const actions = option.getByRole('button', { name: /^(Update |Login to |Updating )/ })
      const actionCount = await actions.count()
      for (let actionIndex = 0; actionIndex < actionCount; actionIndex += 1) {
        const actionBox = await actions.nth(actionIndex).boundingBox()
        expect(actionBox, `provider row ${index} action ${actionIndex} has a box`).not.toBeNull()
        // Fully inside the row: no spill over the divider or out of the pane.
        expect(actionBox!.x).toBeGreaterThanOrEqual(rowBox!.x - 1)
        expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 1)
        expect(actionBox!.y).toBeGreaterThanOrEqual(rowBox!.y - 1)
        expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(rowBox!.y + rowBox!.height + 1)
        // Separated from the title, not painted over it.
        expect(labelBox!.x + labelBox!.width).toBeLessThanOrEqual(actionBox!.x + 1)
      }

      // Rows themselves must not scroll horizontally.
      await expect.poll(() => option.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    }

    // Model rows: names must not overflow their row either.
    const modelOptions = modelsList.getByRole('option')
    const modelCount = await modelOptions.count()
    expect(modelCount).toBeGreaterThan(0)
    for (let index = 0; index < modelCount; index += 1) {
      const option = modelOptions.nth(index)
      const rowBox = await option.boundingBox()
      expect(rowBox, `model row ${index} has a box`).not.toBeNull()
      const name = option.getByText(models[index].name, { exact: true })
      const nameBox = await name.boundingBox()
      expect(nameBox, `model row ${index} name has a box`).not.toBeNull()
      expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 1)
      await expect.poll(() => option.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    }

    // Panes must not bleed past the viewport edges on mobile.
    if (width < 768) {
      const modelsBox = await modelsList.boundingBox()
      expect(modelsBox!.x + modelsBox!.width).toBeGreaterThan(width - 12)
      expect(modelsBox!.x + modelsBox!.width).toBeLessThanOrEqual(width)
    }

    await page.screenshot({
      path: path.resolve(__dirname, `../../.jait/shots/provider-selector-crowded-${width}.png`),
    })
  })
}
