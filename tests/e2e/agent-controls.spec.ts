import path from 'node:path'
import { expect, test } from '@playwright/test'

for (const width of [1280, 390, 320]) {
  test(`agent control opens a menu without stopping work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    let stopCalls = 0
    await page.route('**/api/persona-agents', route => route.fulfill({ json: { agents: [] } }))
    await page.route('**/api/agent-control{,/**}', route => {
      if (route.request().url().endsWith('/halt')) stopCalls += 1
      return route.fulfill({ json: { state: { halted: false, reason: null, haltedAt: null, updatedAt: null } } })
    })
    await page.goto('/src/e2e-fixtures/index.html')
    await page.evaluate(() => import('/src/e2e-fixtures/agent-controls.tsx'))
    const scope = width < 768 ? page.locator('header') : page.getByRole('complementary', { name: 'Workspace sidebar' })
    await scope.locator('[data-agent-control]').click()
    await expect(page.getByRole('menu')).toBeVisible()
    expect(stopCalls).toBe(0)
    await expect(page.getByRole('menuitem', { name: 'Stop all agents', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(scope.locator('[data-agent-control]')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menu')).toBeVisible()
    const menu = (await page.getByRole('menu').boundingBox())!
    expect(menu.x).toBeGreaterThanOrEqual(0)
    expect(menu.x + menu.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `agent-control-menu-${width}.png`) })
    await page.getByRole('menuitem', { name: 'Go to Agents', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Agents page', exact: true })).toBeVisible()
    await expect(page.getByRole('menu')).toHaveCount(0)
    expect(stopCalls).toBe(0)
  })

  test(`agent controls stop and resume without a banner at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    let halted = false
    let stopCalls = 0
    let rejectStop = false
    let releaseStop: (() => void) | undefined
    const state = () => ({ halted, reason: null, haltedAt: halted ? '2026-10-14T12:00:00Z' : null, updatedAt: null })
    await page.route('**/api/persona-agents', route => route.fulfill({ json: { agents: [
      { avatar: 'Sage' }, { avatar: 'Bolt' }, { avatar: 'Muse' },
    ] } }))
    await page.route('**/api/agent-control{,/**}', async route => {
      const url = route.request().url()
      if (url.endsWith('/halt')) {
        stopCalls += 1
        if (rejectStop) return route.fulfill({ status: 500, json: { error: 'Could not stop agents' } })
        await new Promise<void>(resolve => { releaseStop = resolve })
        halted = true
      } else if (url.endsWith('/resume')) halted = false
      await route.fulfill({ json: { state: state() } })
    })
    await page.goto('/src/e2e-fixtures/index.html')
    await page.evaluate(() => import('/src/e2e-fixtures/agent-controls.tsx'))
    const scope = width < 768 ? page.locator('header') : page.getByRole('complementary', { name: 'Workspace sidebar' })
    const stop = scope.getByRole('button', { name: 'Agent controls', exact: true })
    await expect(stop).toBeVisible()
    await expect(stop.locator('svg.agent-creature')).toHaveCount(3)
    const body = stop.locator('.agent-creature-body').first()
    const eyes = stop.locator('.agent-creature-eyes').first()
    await expect(body).toHaveCSS('animation-name', 'agent-work')
    await expect(eyes).toHaveCSS('animation-name', 'agent-blink')
    const initialTransform = await body.evaluate(element => getComputedStyle(element).transform)
    await expect.poll(() => body.evaluate(element => getComputedStyle(element).transform)).not.toBe(initialTransform)
    // Decorative motion must not claim these particular agents are working.
    await expect(stop.locator('[data-agent-state="running"]')).toHaveCount(0)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(body).toHaveCSS('animation-name', 'none')
    await expect(eyes).toHaveCSS('animation-name', 'none')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const faces = await stop.locator('.team-avatar-member').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width }
    }))
    for (let index = 1; index < faces.length; index += 1) {
      expect(faces[index].y).toBe(faces[0].y)
      expect(faces[index].width).toBeGreaterThanOrEqual(24)
      const step = faces[index].x - faces[index - 1].x
      expect(step).toBeGreaterThanOrEqual(faces[index].width * 0.55)
      expect(step).toBeLessThan(faces[index].width * 0.7)
    }
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `agent-control-stack-ready-${width}.png`) })
    if (width >= 768) {
      const account = scope.getByRole('button', { name: 'Account menu' })
      expect((await stop.boundingBox())!.y).toBeLessThan((await account.boundingBox())!.y)
      await scope.getByRole('button', { name: 'Collapse sidebar' }).click()
      await expect(scope).toHaveCSS('width', '56px')
      await expect(stop).toBeVisible()
      const verticalFaces = await stop.locator('.team-avatar-member').evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect()
        return { x: box.x, y: box.y, width: box.width }
      }))
      expect(verticalFaces).toHaveLength(3)
      for (let index = 1; index < verticalFaces.length; index += 1) {
        expect(verticalFaces[index].x).toBe(verticalFaces[0].x)
        expect(verticalFaces[index].width).toBeGreaterThanOrEqual(32)
        expect(verticalFaces[index].y).toBeGreaterThan(verticalFaces[index - 1].y)
      }
      const assertAccountClearance = async () => {
        const controlBox = (await stop.boundingBox())!
        const accountBox = (await account.boundingBox())!
        expect(accountBox.y - (controlBox.y + controlBox.height)).toBeGreaterThanOrEqual(16)
        expect(accountBox.y + accountBox.height).toBeLessThanOrEqual(page.viewportSize()!.height)
        for (const face of await stop.locator('.team-avatar-member').all()) {
          const box = (await face.boundingBox())!
          expect(box.y).toBeGreaterThanOrEqual(controlBox.y)
          expect(box.y + box.height).toBeLessThanOrEqual(controlBox.y + controlBox.height)
        }
      }
      await assertAccountClearance()
      await page.setViewportSize({ width, height: 600 })
      await assertAccountClearance()
      await account.click()
      await expect(page.getByRole('menu')).toBeVisible()
      await page.keyboard.press('Escape')
      await page.setViewportSize({ width, height: 850 })
      await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/agent-control-vertical-desktop.png') })
    } else {
      const header = await scope.boundingBox()
      expect(header!.height).toBe(40)
      const control = await stop.boundingBox()
      expect(control!.width).toBeLessThanOrEqual(64)
      expect(control!.height).toBeLessThanOrEqual(40)
      await scope.getByRole('tab', { name: 'Developer', exact: true }).click()
      await expect(scope.getByRole('tab', { name: 'Developer', exact: true })).toHaveAttribute('aria-selected', 'true')
      await scope.getByRole('tab', { name: 'Manager', exact: true }).click()
      await expect(scope.getByRole('tab', { name: 'Manager', exact: true })).toHaveAttribute('aria-selected', 'true')
      const modes = await scope.getByRole('tablist', { name: 'View mode' }).boundingBox()
      expect(Math.abs(modes!.x + modes!.width / 2 - (header!.x + header!.width / 2))).toBeLessThanOrEqual(1)
      expect(control!.x + control!.width).toBeLessThanOrEqual(modes!.x - 4)
      const account = (await scope.getByRole('button', { name: 'Account menu' }).boundingBox())!
      expect(account.x).toBeGreaterThanOrEqual(modes!.x + modes!.width + 4)
      expect(control!.x).toBeGreaterThanOrEqual(header!.x)
      expect(control!.x + control!.width).toBeLessThanOrEqual(header!.x + header!.width)
    }
    await stop.click()
    await page.getByRole('menuitem', { name: 'Stop all agents', exact: true }).click()
    await expect(stop).toHaveAttribute('aria-busy', 'true')
    await stop.click()
    await expect(page.getByRole('menuitem', { name: 'Stop all agents', exact: true })).toBeDisabled()
    await page.mouse.click(1, 1)
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect.poll(() => stopCalls).toBe(1)
    releaseStop!()
    const resume = stop
    await expect(resume).toHaveAttribute('data-agent-control', 'halted')
    await expect(body).toHaveCSS('animation-name', 'none')
    await expect(eyes).toHaveCSS('animation-name', 'none')
    await expect(page.getByText('Autonomous work is halted.', { exact: true })).toHaveCount(0)
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `agent-control-halted-${width}.png`) })
    await resume.click()
    await page.getByRole('menuitem', { name: 'Resume agents', exact: true }).click()
    await expect(stop).toHaveAttribute('data-agent-control', 'ready')
    await expect(body).toHaveCSS('animation-name', 'agent-work')
    await expect(eyes).toHaveCSS('animation-name', 'agent-blink')
    rejectStop = true
    await stop.click()
    await page.getByRole('menuitem', { name: 'Stop all agents', exact: true }).click()
    await expect(scope.getByRole('alert')).toHaveText('Could not stop agents')
    await expect(stop).toBeEnabled()
    expect(halted).toBe(false)
    if (width < 768) {
      await scope.getByRole('button', { name: 'Open menu', exact: true }).click()
      const drawer = page.getByRole('dialog', { name: 'Navigation' })
      await expect(drawer.getByRole('button', { name: 'Agents', exact: true })).toBeVisible()
      // Account and agent controls live in the mobile header.
      await expect(drawer.getByRole('button', { name: 'Agent controls', exact: true })).toHaveCount(0)
      await expect(drawer.getByRole('button', { name: 'Account settings' })).toHaveCount(0)
      await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `agent-control-stack-drawer-${width}.png`) })
      await drawer.getByRole('button', { name: 'Close menu', exact: true }).click()
      await expect(drawer).not.toBeInViewport()
      await stop.click()
      await page.getByRole('menuitem', { name: 'Go to Agents', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Agents page', exact: true })).toBeVisible()
    }
  })
}

test.describe('mobile header spacing', () => {
  test.use({ hasTouch: true })

  for (const width of [320, 390, 430]) {
    test(`matches control gaps and edge insets at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 850 })
      await page.route('**/api/persona-agents', route => route.fulfill({ json: { agents: [] } }))
      await page.route('**/api/agent-control{,/**}', route => route.fulfill({ json: {
        state: { halted: false, reason: null, haltedAt: null, updatedAt: null },
      } }))
      await page.goto('/src/e2e-fixtures/index.html')
      await page.evaluate(() => import('/src/e2e-fixtures/agent-controls.tsx'))
      const header = page.locator('header')
      const compactVoice = width < 410
      const voice = header.getByRole('button', { name: compactVoice ? 'Voice controls' : 'Enable wake word', exact: true })
      const account = header.getByRole('button', { name: 'Account menu' })
      const menu = header.getByRole('button', { name: 'Open menu' })
      await expect(voice).toBeVisible()
      if (compactVoice) {
        await voice.click()
        await expect(page.getByRole('menuitem', { name: 'Start voice conversation' })).toBeEnabled()
        await page.getByRole('menuitem', { name: 'Enable wake word' }).click()
        await voice.click()
        await expect(page.getByRole('menuitem', { name: 'Disable wake word' })).toBeVisible()
        await page.keyboard.press('Escape')
      } else {
        const talk = header.getByRole('button', { name: 'Start voice conversation', exact: true })
        const talkBox = (await talk.boundingBox())!
        const wakeBox = (await voice.boundingBox())!
        expect(talkBox.width).toBeGreaterThanOrEqual(40)
        expect(wakeBox.x).toBeGreaterThanOrEqual(talkBox.x + talkBox.width)
      }
      const voiceBox = (await voice.boundingBox())!
      const accountBox = (await account.boundingBox())!
      const menuBox = (await menu.boundingBox())!
      expect(voiceBox.width).toBeGreaterThanOrEqual(40)
      expect(voiceBox.height).toBe(40)
      expect(accountBox.height).toBe(40)
      expect(menuBox.height).toBe(40)
      const updateBox = (await header.getByRole('button', { name: /^Update to/ }).boundingBox())!
      const avatar = (await account.locator(':scope > span').boundingBox())!
      const menuIcon = (await menu.locator('svg').boundingBox())!
      const referenceGap = avatar.x - updateBox.x - updateBox.width
      expect(referenceGap).toBe(8)
      expect(menuIcon.x - avatar.x - avatar.width).toBeCloseTo(referenceGap, 0)
      const agentFaces = (await header.locator('[data-agent-control] > span').first().boundingBox())!
      const agentBox = (await header.locator('[data-agent-control]').boundingBox())!
      expect(agentBox.x).toBeGreaterThanOrEqual(voiceBox.x + voiceBox.width)
      expect(agentFaces.x).toBeGreaterThanOrEqual(agentBox.x)
      expect(agentFaces.x + agentFaces.width).toBeLessThanOrEqual(agentBox.x + agentBox.width)
      const tabs = (await header.getByRole('tablist').boundingBox())!
      expect(tabs.x).toBeGreaterThanOrEqual(agentBox.x + agentBox.width + 4)
      expect(tabs.x + tabs.width + 4).toBeLessThanOrEqual(accountBox.x)
      await page.screenshot({ path: path.resolve(__dirname, `../../.jait/shots/mobile-header-spacing-${width}.png`) })
    })
  }
})
