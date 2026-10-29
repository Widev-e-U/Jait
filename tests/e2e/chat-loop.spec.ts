import path from 'node:path'
import { expect, test } from '@playwright/test'

for (const personal of [false, true]) {
  test(`mobile goal recovers missed updates for ${personal ? 'personal' : 'project'} chats`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 850 })
    const session = {
      id: 'recover-chat', projectId: personal ? null : 'recover-project', name: 'Recover goal',
      status: 'active', metadata: null as string | null, createdAt: '2026-10-26T10:00:00Z',
      lastActiveAt: '2026-10-26T10:00:00Z', viewedAt: null, projectPath: null,
    }
    const project = { id: 'recover-project', sessions: [session] }
    let sessionReads = 0
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      const data = path === '/api/projects/last-active' ? { project: personal ? null : project, session }
        : path === '/api/projects' ? { projects: personal ? [] : [project], hasMore: false }
        : path === '/api/sessions' ? { sessions: personal ? [session] : [] }
        : path === '/api/sessions/recover-chat' ? (sessionReads++, session)
        : {}
      await route.fulfill({ json: data })
    })
    await page.goto('/src/e2e-fixtures/goal-recovery.html')
    await expect(page.getByText('Ready', { exact: true })).toBeVisible()
    await expect.poll(() => sessionReads).toBeGreaterThan(0)
    const trigger = page.getByRole('button', { name: 'Expand goal card' })
    await expect(trigger).toHaveCount(0)
    session.metadata = JSON.stringify({ loop: {
      id: 'recovered-loop', goal: 'Finish the saved migration', criteria: ['Verify parity'],
      status: 'running', iteration: 7, revision: 9, checkedIteration: 6, summary: '',
      nextMessage: '', evidence: [], updatedAt: '2026-10-26T11:00:00Z',
    } })
    // A loop started on another device while this mobile client was asleep.
    await page.getByRole('button', { name: 'Reconnect chat' }).click()
    await expect(trigger).toBeVisible()
    await trigger.click()
    const card = page.getByRole('region', { name: 'Chat loop goal' })
    await expect(card).toContainText('Finish the saved migration')
    await expect(card.getByRole('status')).toHaveText('running')
    session.metadata = session.metadata.replace('"running"', '"paused"')
    // Returning from a mobile app background also refreshes the saved status.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(card.getByRole('status')).toHaveText('paused')
    await expect(page.getByTestId('session-count')).toHaveText('1')
  })
}

for (const width of [390, 1280]) {
  test(`goal card controls, evidence and sidebar status at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/src/e2e-fixtures/chat-loop.html')
    if (width < 768) {
      await page.getByRole('button', { name: 'Expand goal card' }).click()
    }
    const card = page.getByRole('region', { name: 'Chat loop goal' })
    await expect(card).toContainText('Fix the failing network inventory check')
    await expect(page.getByTestId('session-row-loop')).toBeVisible()
    await card.getByRole('button', { name: 'Pause goal loop' }).click()
    await expect(card.getByRole('status')).toHaveText('paused')
    await expect(page.getByTestId('session-row-loop')).toHaveCount(0)
    await card.getByRole('button', { name: 'Resume goal loop' }).click()
    await expect(page.getByTestId('session-row-loop')).toBeVisible()
    await page.getByRole('button', { name: 'Toggle gateway failure' }).click()
    await card.getByRole('button', { name: 'Pause goal loop' }).click()
    await expect(card.getByRole('alert')).toContainText('Gateway unavailable')
    await expect(card.getByRole('status')).toHaveText('running')
    await page.getByRole('button', { name: 'Ask question', exact: true }).click()
    await expect(page.getByLabel('Loop waiting for your answer')).toBeVisible()
    await page.getByRole('button', { name: 'Complete goal', exact: true }).click()
    await expect(card.getByRole('status')).toHaveText('completed')
    await expect(card.getByRole('button', { name: /goal loop/ })).toHaveCount(0)
    await card.locator('summary').click()
    await expect(card).toContainText('Regression check exited 0')
    await expect(card).toContainText('Scope boundary tests exited 0')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `chat-loop-${width}.png`) })
  })
}


test('mobile goal stays a compact icon and label until tapped', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 })
  await page.goto('/src/e2e-fixtures/chat-loop.html')

  const trigger = page.getByRole('button', { name: 'Expand goal card' })
  const card = page.getByRole('region', { name: 'Chat loop goal' })
  const goal = page.getByText('Fix the failing network inventory check and verify the result', { exact: true })

  await expect(trigger).toBeVisible()
  await expect(trigger).toHaveText('Goal')
  await expect(trigger.locator('svg')).toHaveCount(1)
  await expect(card).toHaveCount(0)
  await expect(goal).toBeHidden()
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/chat-loop-mobile-compact.png') })

  await trigger.click()
  await expect(card).toBeVisible()
  await expect(goal).toBeVisible()
  await expect(card.getByRole('button', { name: 'Collapse goal card' })).toHaveAttribute('aria-expanded', 'true')
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/chat-loop-mobile-expanded.png') })

  await card.getByRole('button', { name: 'Collapse goal card' }).click()
  await expect(trigger).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(card).toHaveCount(0)
})

test('goal card remembers its collapsed state per chat across navigation and reloads', async ({ page }) => {
  await page.goto('/src/e2e-fixtures/chat-loop.html')
  const card = page.getByRole('region', { name: 'Chat loop goal' })
  const goal = card.getByText('Fix the failing network inventory check and verify the result', { exact: true })
  await expect(goal).toBeVisible()
  const collapse = card.getByRole('button', { name: 'Collapse goal card' })
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')
  await collapse.focus()
  await collapse.press('Enter')
  await expect(card.getByRole('button', { name: 'Expand goal card' })).toHaveAttribute('aria-expanded', 'false')
  await expect(goal).toBeHidden()
  await expect(card.getByRole('button', { name: 'Pause goal loop' })).toBeHidden()
  await expect(card.getByRole('status')).toHaveText('running')

  await page.getByRole('button', { name: 'Open chat B' }).click()
  await expect(goal).toBeVisible()
  await card.getByRole('button', { name: 'Collapse goal card' }).click()
  await page.getByRole('button', { name: 'Open chat A' }).click()
  await expect(goal).toBeHidden()
  await card.getByRole('button', { name: 'Expand goal card' }).click()
  await expect(goal).toBeVisible()

  await page.reload()
  await expect(goal).toBeVisible()
  await page.getByRole('button', { name: 'Open chat B' }).click()
  await expect(goal).toBeHidden()
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/chat-loop-collapsed.png') })
  await page.reload()
  await page.getByRole('button', { name: 'Open chat B' }).click()
  await expect(goal).toBeHidden()
})

for (const width of [390, 1280]) {
  for (const reducedMotion of [false, true]) {
    test(`goal frame grows and shrinks at ${width}px with reduced motion ${reducedMotion}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 850 })
      await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
      await page.goto('/src/e2e-fixtures/chat-loop.html')
      const frame = page.getByTestId('loop-goal-card')
      await expect(frame.getByRole('button', { name: /goal card/ })).toHaveAttribute('aria-expanded', width < 768 ? 'false' : 'true')
      if (reducedMotion) await expect(frame).toHaveCSS('transition-property', 'none')
      else {
        await expect(frame).toHaveCSS('transition-duration', '0.18s')
        await expect(frame).toHaveCSS('transition-property', 'height')
      }
      for (let toggle = 0; toggle < 2; toggle++) {
        const sizes = await frame.evaluate(async element => {
          const before = element.getBoundingClientRect()
          const samples: Array<{ width: number; height: number }> = []
          element.querySelector<HTMLButtonElement>('button')!.click()
          const started = performance.now()
          do {
            await new Promise(requestAnimationFrame)
            const rect = element.getBoundingClientRect()
            samples.push({ width: rect.width, height: rect.height })
          } while (performance.now() - started < 400)
          return { before: { width: before.width, height: before.height }, samples }
        })
        const after = sizes.samples.at(-1)!
        expect(Math.abs(after.height - sizes.before.height)).toBeGreaterThan(30)
        // Measure actual intermediate sizes, not just the transition class.
        const intermediateHeight = sizes.samples.some(sample => sample.height > Math.min(after.height, sizes.before.height) + 1 && sample.height < Math.max(after.height, sizes.before.height) - 1)
        expect(intermediateHeight).toBe(!reducedMotion)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    })
  }
}

for (const width of [390, 900, 1440]) {
  test(`floating goal keeps transcript and previous message in place at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.route('**/api/**', route => route.fulfill({ json: { providers: [], models: [], skills: [], agents: [], projects: [], sessions: [] } }))
    await page.goto('/src/e2e-fixtures/queue-edit-workspace.html?goal=1')
    const scroll = page.locator('[data-conversation-scroll]')
    await expect(scroll).toHaveCSS('visibility', 'visible')
    await scroll.evaluate(el => { el.scrollTop = el.scrollHeight })
    await expect.poll(() => scroll.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(1)
    await scroll.hover()
    await page.mouse.wheel(0, -300)
    const overlay = page.getByTestId('chat-goal-overlay')
    const frame = page.getByTestId('loop-goal-card')
    await expect(overlay).toBeVisible()
    await expect(overlay).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    const transcriptTop = (await scroll.boundingBox())!.y
    const previous = page.getByRole('button', { name: 'Jump to and edit previous user message' })
    await expect(previous).toBeVisible()
    const previousTop = (await previous.boundingBox())!.y
    expect(previousTop - transcriptTop).toBeLessThanOrEqual(width < 768 ? 57 : 41)
    if (width < 768) {
      const header = page.getByTestId('fixture-mobile-header')
      expect((await frame.boundingBox())!.y).toBeGreaterThanOrEqual((await header.boundingBox())!.y + (await header.boundingBox())!.height)
      const compactWidth = (await frame.boundingBox())!.width
      expect(compactWidth).toBeLessThan(110)
      // Space beside the pill passes pointer input through to the transcript.
      const clearPoint = await overlay.evaluate(el => {
        const rect = el.getBoundingClientRect()
        return document.elementFromPoint(rect.right - 5, rect.top + 5)?.closest('[data-testid="chat-goal-overlay"]') == null
      })
      expect(clearPoint).toBe(true)
      await page.getByRole('button', { name: 'Expand goal card' }).click()
      await expect(page.getByText('Verify the floating goal layout', { exact: true })).toBeVisible()
      await expect.poll(async () => (await frame.boundingBox())!.width).toBeGreaterThan(compactWidth + 100)
      expect((await scroll.boundingBox())!.y).toBe(transcriptTop)
      expect((await previous.boundingBox())!.y).toBe(previousTop)
      await page.getByRole('button', { name: 'Collapse goal card' }).click()
    }
    await page.screenshot({ path: path.resolve(__dirname, `../../.jait/shots/goal-overlay-${width}.png`) })
    await page.getByRole('button', { name: 'Toggle goal overlay' }).click()
    await expect(overlay).toHaveCount(0)
    expect((await scroll.boundingBox())!.y).toBe(transcriptTop)
    expect((await previous.boundingBox())!.y).toBe(previousTop)
  })
}

for (const width of [390, 1440]) {
  test(`long expanded goal scrolls to its controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 660 })
    let pauseRequests = 0
    await page.route('**/api/**', route => {
      if (new URL(route.request().url()).pathname.endsWith('/loop') && route.request().method() === 'POST') pauseRequests++
      return route.fulfill({ json: { providers: [], models: [], skills: [], agents: [], projects: [], sessions: [] } })
    })
    await page.goto('/src/e2e-fixtures/queue-edit-workspace.html?goal=long')
    // This fixture-only control sits in the lower corner used by the goal card.
    await page.getByRole('button', { name: 'Toggle goal overlay' }).evaluate(el => el.remove())
    if (width < 768) await page.getByRole('button', { name: 'Expand goal card' }).click()
    const card = page.getByTestId('loop-goal-card')
    await card.locator('summary').click()
    await expect.poll(() => card.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)
    await card.hover()
    await page.mouse.wheel(0, 10000)
    await expect.poll(() => card.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2)
    await expect(card.getByText('Criterion 20:', { exact: false })).toBeInViewport()
    const pause = card.getByRole('button', { name: 'Pause goal loop' })
    await expect(pause).toBeInViewport()
    const bounds = (await card.boundingBox())!
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(660)
    // The card must cover the input itself and receive pointer input there.
    const composerBounds = (await page.getByTestId('chat-composer').boundingBox())!
    const overlap = {
      left: Math.max(bounds.x, composerBounds.x),
      top: Math.max(bounds.y, composerBounds.y),
      right: Math.min(bounds.x + bounds.width, composerBounds.x + composerBounds.width),
      bottom: Math.min(bounds.y + bounds.height, composerBounds.y + composerBounds.height),
    }
    expect(overlap.right - overlap.left, 'card should overlap the input horizontally').toBeGreaterThan(0)
    expect(overlap.bottom - overlap.top, 'card should overlap the input vertically').toBeGreaterThan(0)
    const cardReceivesOverlap = await page.evaluate(
      ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('[data-testid="loop-goal-card"]')),
      { x: (overlap.left + overlap.right) / 2, y: (overlap.top + overlap.bottom) / 2 },
    )
    expect(cardReceivesOverlap).toBe(true)
    await pause.click({ timeout: 3000 })
    await expect.poll(() => pauseRequests).toBe(1)
    await card.getByRole('button', { name: 'Collapse goal card' }).click()
    const composer = page.getByRole('textbox', { name: 'Message' })
    await composer.click()
    await expect(composer).toBeFocused()
  })
}
