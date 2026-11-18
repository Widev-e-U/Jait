import path from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * Regression cover for the mobile model list: group headers overlapping the
 * model rows (stale virtualizer measurements), the favorites section not
 * surfacing, and — after making groups collapsible — the group headers keeping
 * their backend provider icons.
 */

const providedAt = '2024-01-01T00:00:00.000Z'

const providers = [
  {
    id: 'jait',
    providerType: 'jait',
    name: 'Jait (Built-in)',
    description: 'Native Jait agent loop.',
    available: true,
    installed: true,
    modes: ['full-access'],
    nodeId: 'gateway',
  },
  {
    id: 'claude-code',
    providerType: 'claude-code',
    name: 'Claude Agent — Privat (Gateway)',
    available: true,
    installed: true,
    modes: ['full-access'],
    nodeId: 'gateway',
    auth: { login: true, logout: true, deviceCode: false, authenticated: true },
    update: {
      currentVersion: '1.2.3',
      latestVersion: '9.9.9',
      updateAvailable: true,
      checkedAt: providedAt,
    },
  },
  {
    id: 'codex-work',
    providerType: 'codex',
    name: 'Codex — Work',
    available: true,
    installed: true,
    modes: ['full-access'],
    nodeId: 'gateway',
    auth: { login: true, logout: true, deviceCode: false, authenticated: true },
  },
]

const models = [
  { id: 'gemma4:8b', name: 'gemma4:8b', group: 'Ollama', description: 'Ollama · gemma4 · 8.0B' },
  { id: 'gemma4:26b', name: 'gemma4:26b', group: 'Ollama', description: 'Ollama · gemma4 · 25.8B' },
  {
    id: 'CognitiveComputations/dolphin-mistral-nemo:12b',
    name: 'CognitiveComputations/dolphin-mistral-nemo:12b',
    group: 'Ollama',
    description: 'dolphin-mistral-nemo · 12.2B',
  },
  { id: 'qwen3-coder:480b', name: 'qwen3-coder:480b', group: 'Ollama', description: 'Ollama · qwen3-coder · 480B' },
  {
    id: 'jait://omniroute/local-omniroute/auto',
    name: 'auto',
    group: 'LOCAL OmniRoute · OmniRoute',
    isDefault: true,
    description: 'OmniRoute · Smart routing across models',
  },
  { id: 'agy/claude-opus-4-6-thinking', name: 'agy/claude-opus-4-6-thinking', group: 'LOCAL OmniRoute · OmniRoute', description: 'OmniRoute · by agy' },
  { id: 'agy/claude-opus-4-6-thinking-high', name: 'agy/claude-opus-4-6-thinking-high', group: 'LOCAL OmniRoute · OmniRoute', description: 'OmniRoute · by agy' },
  { id: 'agy/claude-opus-4-6-thinking-low', name: 'agy/claude-opus-4-6-thinking-low', group: 'LOCAL OmniRoute · OmniRoute', description: 'OmniRoute · by agy' },
  { id: 'agy/claude-opus-4-6-thinking-medium', name: 'agy/claude-opus-4-6-thinking-medium', group: 'LOCAL OmniRoute · OmniRoute', description: 'OmniRoute · by agy' },
  { id: 'agy/claude-sonnet-4-6', name: 'agy/claude-sonnet-4-6', group: 'LOCAL OmniRoute · OmniRoute', description: 'OmniRoute · by agy' },
  { id: 'agy/claude-sonnet-4-6-high', name: 'agy/claude-sonnet-4-6-high', group: 'LOCAL OmniRoute · OmniRoute', description: 'OmniRoute · by agy' },
  { id: 'deepseek/deepseek-v4-pro', name: 'deepseek/deepseek-v4-pro', group: 'LOCAL OmniRoute · OmniRoute', description: 'OmniRoute · by deepseek' },
  { id: 'openrouter/anthropic/claude-4.6', name: 'openrouter/anthropic/claude-4.6', group: 'OpenRouter', description: 'OpenRouter · anthropic/claude-4.6' },
  { id: 'openai/gpt-5.6-sol', name: 'openai/gpt-5.6-sol', group: 'OpenAI', description: 'OpenAI · gpt-5.6-sol' },
  { id: 'openai/gpt-5.6-codex', name: 'openai/gpt-5.6-codex', group: 'OpenAI', description: 'OpenAI · gpt-5.6-codex' },
]

const favoriteIds = ['gemma4:26b', 'agy/claude-opus-4-6-thinking']

test('mobile model list keeps rows separated, favorites visible and groups collapsible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript((ids) => {
    window.localStorage.setItem('jait.modelFavorites', JSON.stringify(
      ids.map((modelId: string) => ({ provider: 'jait', modelId })),
    ))
  }, favoriteIds)
  await page.route(/\/api\/providers(?:\?|$)/, route => route.fulfill({ json: {
    providers, remoteProviders: [],
  } }))
  await page.route('**/api/providers/*/models*', route => route.fulfill({ json: { models, currentBackend: 'ollama' } }))
  await page.route(url => url.pathname === '/', async route => {
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replace('/src/main.tsx', '/src/e2e-fixtures/provider-selector-models-layout.tsx') })
  })
  await page.route('**/api/auth/refresh', route => route.fulfill({ json: { access_token: 'layout-fixture-token' } }))
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'fixture', username: 'fixture' } }))
  await page.route('**/api/settings', route => route.fulfill({ json: {} }))
  await page.goto('/')

  const modelsList = page.getByRole('listbox', { name: 'Models', exact: true })
  const openPicker = async () => {
    await page.getByRole('button', { name: /^Provider Jait \(Built-in\), model/ }).click()
    await expect(page.getByRole('dialog', { name: 'Provider and model', exact: true })).toBeVisible()
    await expect(modelsList.getByRole('option').first()).toBeVisible()
    await page.waitForTimeout(250)
  }
  const closePicker = async () => {
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Provider and model', exact: true })).toBeHidden()
  }

  // Rendered rows (headers + model rows) must never overlap each other.
  const assertRowsSeparated = async (label: string) => {
    const boxes = await modelsList.locator('[data-index]').evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return { top: rect.top, bottom: rect.bottom, text: (element.textContent ?? '').slice(0, 40) }
        })
        .sort((a, b) => a.top - b.top),
    )
    for (let index = 1; index < boxes.length; index += 1) {
      const previous = boxes[index - 1]!
      const current = boxes[index]!
      expect(
        current.top,
        `[${label}] row ${index} (${current.text} @${current.top.toFixed(1)}-${current.bottom.toFixed(1)}) overlaps ${previous.text} (@${previous.top.toFixed(1)}-${previous.bottom.toFixed(1)})`,
      ).toBeGreaterThanOrEqual(previous.bottom - 1)
    }
  }

  await openPicker()
  await assertRowsSeparated('open at selected model')
  await page.screenshot({
    path: path.resolve(__dirname, `../../.jait/shots/provider-selector-model-list-390.png`),
  })

  // Favorites must surface as their own section at the top of the list.
  await modelsList.evaluate((element) => { element.scrollTop = 0 })
  await page.waitForTimeout(250)
  await expect(modelsList.getByText('Favorites', { exact: true })).toBeVisible()
  for (const modelId of favoriteIds) {
    await expect(modelsList.getByText(modelId, { exact: true }).first()).toBeVisible()
  }
  await assertRowsSeparated('scrolled to top with favorites')

  // Scroll through the list; new rows must stay separated as they mount.
  for (const fraction of [0.35, 0.7, 1]) {
    await modelsList.evaluate((element, f) => {
      element.scrollTop = element.scrollHeight * (f as number)
    }, fraction)
    await page.waitForTimeout(150)
    await assertRowsSeparated(`scrolled to ${fraction}`)
  }
  await page.screenshot({
    path: path.resolve(__dirname, `../../.jait/shots/provider-selector-model-list-390-scrolled.png`),
  })

  // Group headers carry the backend provider icon and collapse their section.
  await modelsList.evaluate((element) => { element.scrollTop = 0 })
  await page.waitForTimeout(200)
  const ollamaHeader = modelsList.getByRole('button', { name: /Ollama/ }).first()
  await ollamaHeader.scrollIntoViewIfNeeded()
  expect(await ollamaHeader.locator('svg').count()).toBeGreaterThan(0)
  await expect(ollamaHeader).toHaveAttribute('aria-expanded', 'true')
  await modelsList.getByText('gemma4:8b', { exact: true }).first().scrollIntoViewIfNeeded()
  await expect(modelsList.getByText('gemma4:8b', { exact: true })).toHaveCount(1)
  await ollamaHeader.click()
  await expect(ollamaHeader).toHaveAttribute('aria-expanded', 'false')
  await expect(modelsList.getByText('gemma4:8b', { exact: true })).toHaveCount(0)
  await assertRowsSeparated('with Ollama collapsed')
  await ollamaHeader.click()
  await expect(ollamaHeader).toHaveAttribute('aria-expanded', 'true')
  await expect(modelsList.getByText('gemma4:8b', { exact: true })).toHaveCount(1)
  await assertRowsSeparated('with Ollama expanded again')

  // Toggling a favorite must immediately add it to the favorites section …
  await modelsList.evaluate((element) => { element.scrollTop = 0 })
  await page.waitForTimeout(200)
  const gemma8b = modelsList.getByText('gemma4:8b', { exact: true }).first()
  await gemma8b.scrollIntoViewIfNeeded()
  await expect(modelsList.getByText('gemma4:8b', { exact: true })).toHaveCount(1)
  await modelsList.getByRole('button', { name: 'Add gemma4:8b to favorites' }).click()
  await expect(modelsList.getByText('gemma4:8b', { exact: true })).toHaveCount(2)
  await assertRowsSeparated('after toggling a favorite')

  // … and must survive closing + reopening the picker.
  await closePicker()
  await openPicker()
  await modelsList.evaluate((element) => { element.scrollTop = 0 })
  await page.waitForTimeout(250)
  await expect(modelsList.getByText('Favorites', { exact: true })).toBeVisible()
  await expect(modelsList.getByText('gemma4:8b', { exact: true })).toHaveCount(2)
  await assertRowsSeparated('after reopen')

  await page.screenshot({
    path: path.resolve(__dirname, `../../.jait/shots/provider-selector-model-list-390-reopen.png`),
  })
})


test('model and reasoning selection exposes supported choices and resets incompatible effort', async ({ page }) => {
  const choices = [
    { id: 'first', name: 'First model', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'ultra' }] },
    { id: 'second', name: 'Second model', supportedReasoningEfforts: [{ reasoningEffort: 'high' }] },
    { id: 'third', name: 'Third model' },
  ]
  await page.route(/\/api\/providers(?:\?|$)/, route => route.fulfill({ json: { providers, remoteProviders: [] } }))
  await page.route('**/api/providers/*/models*', route => route.fulfill({ json: { models: choices } }))
  await page.route(url => url.pathname === '/', async route => {
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replace('/src/main.tsx', '/src/e2e-fixtures/provider-selector-models-layout.tsx') })
  })
  await page.route('**/api/auth/refresh', route => route.fulfill({ json: { access_token: 'layout-fixture-token' } }))
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'fixture', username: 'fixture' } }))
  await page.route('**/api/settings', route => route.fulfill({ json: {} }))
  await page.goto('/')
  const trigger = page.getByRole('button', { name: /^Provider Jait/ })
  await trigger.click()
  await page.getByRole('option', { name: /First model/ }).click()
  const effort = page.getByRole('combobox', { name: 'Reasoning effort' })
  await expect(effort).toContainText('Default')
  await effort.click()
  await expect(page.getByRole('option', { name: 'Medium' })).toBeVisible()
  await page.getByRole('option', { name: 'Ultra' }).click()
  await expect(effort).toContainText('Ultra')
  await trigger.click()
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Reasoning effort' })).toHaveCount(0)
  await page.getByRole('option', { name: /Second model/ }).click()
  await expect(effort).toContainText('Default')
  await effort.click()
  await expect(page.getByRole('option', { name: 'High' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Ultra' })).toHaveCount(0)
  await page.getByRole('option', { name: 'High' }).click()
  await trigger.click()
  await page.getByRole('option', { name: /Third model/ }).click()
  await expect(effort).toHaveCount(0)
})


test('mobile chat shows supported reasoning modes beside the provider', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const choices = [
    { id: 'first', name: 'First model', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'ultra' }] },
    { id: 'second', name: 'Second model', supportedReasoningEfforts: [{ reasoningEffort: 'high' }] },
    { id: 'third', name: 'Third model' },
  ]
  await page.route(/\/api\/providers(?:\?|$)/, route => route.fulfill({ json: { providers, remoteProviders: [] } }))
  await page.route('**/api/providers/*/models*', route => route.fulfill({ json: { models: choices } }))
  await page.route(url => url.pathname === '/', async route => {
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replace('/src/main.tsx', '/src/e2e-fixtures/provider-selector-models-layout.tsx') })
  })
  await page.route('**/api/auth/refresh', route => route.fulfill({ json: { access_token: 'layout-fixture-token' } }))
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'fixture', username: 'fixture' } }))
  await page.route('**/api/settings', route => route.fulfill({ json: {} }))
  await page.goto('/')
  const trigger = page.getByRole('button', { name: /^Provider Jait/ })
  await trigger.click()
  await page.getByRole('option', { name: /First model/ }).click()
  const effort = page.getByRole('combobox', { name: 'Reasoning effort' })
  await expect(effort).toContainText('Default')
  await expect(effort.locator('svg.lucide-brain')).toHaveCount(1)
  await effort.click()
  await page.getByRole('option', { name: 'Ultra' }).click()
  await expect(effort).toContainText('Ultra')
  await expect(effort.locator('svg.lucide-rocket')).toHaveCount(1)
  await trigger.click()
  await page.getByRole('option', { name: /Second model/ }).click()
  await expect(effort).toContainText('Default')
  await effort.click()
  await expect(page.getByRole('option', { name: 'High' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Ultra' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await trigger.click()
  await page.getByRole('option', { name: /Third model/ }).click()
  await expect(effort).toHaveCount(0)
})
