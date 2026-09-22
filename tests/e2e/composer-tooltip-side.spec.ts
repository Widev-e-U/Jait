import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'

/**
 * Every tooltip trigger in the chat composer (selects, attach/voice buttons,
 * send button, copy-chat-id) must open BELOW the trigger, because the composer
 * sits at the bottom of the viewport and a tooltip above it covers the input.
 */
test('composer tooltips open below their trigger', async ({ page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1280, height: 900 })

  const registration = await page.request.post(`${API_URL}/api/auth/register`, {
    data: { username: `composer-tooltip-${Date.now()}`, password: 'e2e-password-123' },
  })
  expect(registration.ok()).toBeTruthy()
  const { access_token: apiToken } = await registration.json()
  const headers = { Authorization: `Bearer ${apiToken}` }

  const projectResponse = await page.request.post(`${API_URL}/api/projects`, {
    headers,
    data: {
      rootPath: path.resolve(process.cwd(), '../..'),
      nodeId: 'gateway',
      title: 'Composer tooltip side',
    },
  })
  expect(projectResponse.ok()).toBeTruthy()
  const project = await projectResponse.json()

  const sessionResponse = await page.request.post(`${API_URL}/api/projects/${project.id}/sessions`, {
    headers,
    data: { name: 'Composer tooltip side' },
  })
  expect(sessionResponse.ok()).toBeTruthy()
  const session = await sessionResponse.json()
  await page.request.post(`${API_URL}/api/projects/select`, {
    headers,
    data: { projectId: project.id, sessionId: session.id },
  })

  await page.addInitScript(({ token, gateway }) => {
    localStorage.setItem('jait-auth-token', token)
    localStorage.setItem('jait-gateway-url', gateway)
  }, { token: apiToken, gateway: API_URL })

  const seen: string[] = []
  page.on('response', (response) => {
    if (response.url().includes('/api/sessions/')) seen.push(response.url())
  })

  await page.goto('/')

  const composer = page.locator('[data-testid="chat-composer"]')
  try {
    await expect(composer).toBeVisible({ timeout: 150_000 })
  } catch (error) {
    console.log(`[composer-tooltip-side] session responses seen: ${seen.join(', ') || 'none'}`)
    console.log(`[composer-tooltip-side] page url: ${page.url()}`)
    throw error
  }

  const tooltip = page.locator('[data-slot="tooltip-content"]')
  const triggers = composer.locator('[data-slot="tooltip-trigger"]')
  await expect(triggers.first()).toBeVisible({ timeout: 30_000 })

  const triggerCount = await triggers.count()
  expect(triggerCount).toBeGreaterThanOrEqual(3)

  const checked: string[] = []
  let shotPath: string | null = null

  for (let index = 0; index < triggerCount; index += 1) {
    const trigger = triggers.nth(index)
    await page.mouse.move(4, 4)
    await page.waitForTimeout(80)
    await trigger.scrollIntoViewIfNeeded()
    await trigger.hover({ force: true })

    // Tooltip providers use a short delay; give it a moment to appear.
    let visible = false
    for (let attempt = 0; attempt < 12 && !visible; attempt += 1) {
      if (await tooltip.count() > 0) {
        visible = await tooltip.first().isVisible().catch(() => false)
        if (visible) break
      }
      await page.waitForTimeout(120)
    }
    if (!visible) {
      // A trigger without hint content renders no tooltip at all.
      continue
    }

    const label = ((await trigger.getAttribute('aria-label'))
      || (await trigger.innerText())
      || 'unnamed trigger').replace(/\s+/g, ' ').trim().slice(0, 60)

    const side = await tooltip.first().getAttribute('data-side')
    expect(side, `tooltip for "${label}" should open below the trigger`).toBe('bottom')

    const triggerBox = await trigger.boundingBox()
    const tooltipBox = await tooltip.first().boundingBox()
    expect(triggerBox).not.toBeNull()
    expect(tooltipBox).not.toBeNull()
    if (triggerBox && tooltipBox) {
      expect(
        tooltipBox.y,
        `tooltip for "${label}" should be rendered under the trigger`,
      ).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height - 2)
    }

    checked.push(label)

    if (!shotPath) {
      // One screenshot of the first hovering tooltip proves the visual result.
      const shotsDir = path.resolve(process.cwd(), '../../.jait/shots')
      fs.mkdirSync(shotsDir, { recursive: true })
      shotPath = path.join(shotsDir, 'composer-tooltip-bottom.png')
      await page.screenshot({ path: shotPath })
    }
  }

  // Guard against the sweep silently matching nothing.
  expect(checked.length).toBeGreaterThanOrEqual(3)
  console.log(`[composer-tooltip-side] verified bottom tooltips for: ${checked.join(', ')}`)
})
