import path from 'node:path'
import { expect, test } from '@playwright/test'

for (const width of [320, 390, 1280]) {
  test(`model names remain readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.route(/\/api\/providers(?:\?|$)/, route => route.fulfill({ json: {
      providers: [
        { id: 'codex', providerType: 'codex', name: 'Codex', available: true, modes: ['full-access'], nodeId: 'gateway' },
        ...[true, false].map(authenticated => ({
          id: authenticated ? 'claude-private' : 'claude-work', providerType: 'claude-code',
          name: authenticated ? 'Claude Agent — Privat' : 'Claude Agent — Work',
          available: true, modes: ['full-access'], nodeId: 'gateway',
          auth: { authenticated, login: true, logout: true },
          update: { currentVersion: '1.0.0', latestVersion: '2.0.0', updateAvailable: true, checkedAt: '2026-10-23T00:00:00Z' },
        })),
      ], remoteProviders: [],
    } }))
    await page.route('**/api/providers/*/models*', route => route.fulfill({ json: { models: [
      { id: 'gpt-6.1', name: 'GPT-6.1', isDefault: true, reasoningEffortSupported: true },
      { id: 'gpt-6.1-long', name: 'GPT-6.1 with an extended model name' },
    ] } }))
    await page.route(url => url.pathname === '/', async route => {
      const response = await route.fetch()
      await route.fulfill({ response, body: (await response.text()).replace('/src/main.tsx', '/src/e2e-fixtures/provider-selector-layout.tsx') })
    })
    await page.route('**/api/auth/refresh', route => route.fulfill({ json: { access_token: 'layout-fixture-token' } }))
    await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'fixture', username: 'fixture' } }))
    await page.route('**/api/settings', route => route.fulfill({ json: {} }))
    await page.goto('/')
    await page.getByRole('button', { name: /^Provider Codex, model/ }).click()
    const models = page.getByRole('listbox', { name: 'Models', exact: true })
    const name = models.getByText('GPT-6.1', { exact: true })
    await expect(name).toBeVisible()
    await expect.poll(() => name.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await expect(page.getByText(/^Current:/)).toHaveCount(0)
    const group = models.getByTitle('Collapse Codex', { exact: true })
    await expect(group).toBeVisible()
    expect(await group.evaluate(element => {
      const style = getComputedStyle(element)
      return { borderWidth: style.borderTopWidth, radius: style.borderTopLeftRadius, background: style.backgroundColor }
    })).toEqual({ borderWidth: '0px', radius: '0px', background: 'rgba(0, 0, 0, 0)' })
    for (const decoration of await group.locator('span').all()) {
      expect(await decoration.evaluate(element => ({
        background: getComputedStyle(element).backgroundColor,
        radius: getComputedStyle(element).borderTopLeftRadius,
        shadow: getComputedStyle(element).boxShadow,
      }))).toEqual({ background: 'rgba(0, 0, 0, 0)', radius: '0px', shadow: 'none' })
    }
    const groupSpacing = await group.evaluate(element => {
      const container = element.parentElement!.getBoundingClientRect()
      const title = element.getBoundingClientRect()
      return { above: title.top - container.top, below: container.bottom - title.bottom }
    })
    expect(groupSpacing.above).toBeGreaterThan(0)
    expect(groupSpacing.above).toBeCloseTo(groupSpacing.below, 1)
    for (const option of await models.getByRole('option').all()) {
      const offsets = await option.evaluate(element => {
        const row = element.getBoundingClientRect()
        const center = row.top + row.height / 2
        return Array.from(element.children).map(child => {
          const box = child.getBoundingClientRect()
          return Math.abs(box.top + box.height / 2 - center)
        })
      })
      for (const offset of offsets) expect(offset).toBeLessThanOrEqual(1)
    }
    for (const label of ['Claude Agent — Privat', 'Claude Agent — Work']) {
      const provider = page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) })
      const name = provider.getByText(label, { exact: true })
      const update = page.getByRole('button', { name: `Update ${label} to 2.0.0`, exact: true })
      await expect(update).toBeVisible()
      const nameBox = await name.boundingBox()
      const updateBox = await update.boundingBox()
      expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(updateBox!.x)
      if (label.endsWith('Work')) {
        const login = page.getByRole('button', { name: `Login to ${label}`, exact: true })
        const loginBox = await login.boundingBox()
        expect(updateBox!.x + updateBox!.width).toBeLessThanOrEqual(loginBox!.x)
      }
      if (width < 768) {
        expect(await name.evaluate(element => ({
          truncated: element.scrollWidth > element.clientWidth,
          textOverflow: getComputedStyle(element).textOverflow,
          whiteSpace: getComputedStyle(element).whiteSpace,
        }))).toEqual({ truncated: true, textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
      }
    }
    if (width < 768) {
      const longName = models.getByText('GPT-6.1 with an extended model name', { exact: true })
      await expect.poll(() => longName.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      const dialog = page.getByRole('dialog', { name: 'Provider and model', exact: true })
      await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      const providers = page.getByRole('listbox', { name: 'Providers', exact: true })
      const providerPane = await providers.locator('..').boundingBox()
      const modelPane = await models.locator('..').boundingBox()
      const providerShare = providerPane!.width / (providerPane!.width + modelPane!.width)
      expect(providerShare).toBeGreaterThan(0.49)
      expect(providerShare).toBeLessThan(0.51)
      const box = await models.boundingBox()
      expect(box!.x + box!.width).toBeGreaterThan(width - 12)
    }
    const help = page.getByRole('button', { name: 'About reasoning effort', exact: true })
    const explanation = page.getByText('Controls how much the model reasons before answering. Only applies to this reasoning model.', { exact: true })
    await expect(help).toBeVisible()
    await expect(explanation).not.toBeVisible()
    if (width < 768) await help.click()
    else await help.hover()
    await expect(explanation).toBeVisible()
    if (width < 768) {
      await page.keyboard.press('Escape')
    } else {
      const searchBox = await page.getByPlaceholder('Search models...').boundingBox()
      await page.mouse.move(searchBox!.x + searchBox!.width / 2, searchBox!.y + searchBox!.height / 2, { steps: 10 })
    }
    await expect(explanation).not.toBeVisible()
    await expect(models).toBeVisible()
    if (width >= 768) {
      await help.focus()
      await expect(explanation).toBeVisible()
      await page.getByPlaceholder('Search models...').focus()
      await expect(explanation).not.toBeVisible()
    }
    await page.screenshot({ path: path.resolve(__dirname, `../../.jait/shots/provider-selector-${width}.png`) })
    await models.getByRole('option').filter({ hasText: 'GPT-6.1 with an extended model name' }).click()
    await expect(page.getByRole('button', { name: /^Provider Codex, model/ })).toHaveAccessibleName(/extended model name/)
  })
}
