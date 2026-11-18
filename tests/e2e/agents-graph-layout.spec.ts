import { expect, test } from '@playwright/test'
import path from 'node:path'

for (const width of [390, 1440]) {
  test(`Agents graph is stationary from its first visible frame at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.route('**/api/**', route => route.fulfill({ json: {
      providers: [{ id: 'codex', name: 'Codex', isAvailable: true, type: 'codex' }], remoteProviders: [], models: [],
    } }))
    await page.goto('/src/e2e-fixtures/index.html')
    await page.evaluate(() => {
      const state = window as unknown as { graphFrames: number[][][]; firstGraphFrame?: number }
      state.graphFrames = []
      const sample = (time: number) => {
        const graph = document.querySelector('[aria-label="Agent reporting graph"]')
        const cards = [...document.querySelectorAll<HTMLElement>('[data-testid="agent-graph-node"]')]
        if (graph?.querySelector('canvas:not([aria-hidden])') && cards.length === 5
          && cards.every(card => getComputedStyle(card).visibility === 'visible')) {
          state.firstGraphFrame ??= time
          // Sort by identity so profile refreshes cannot change sample ordering.
          state.graphFrames.push(cards.sort((a, b) => a.textContent!.localeCompare(b.textContent!)).map(card => {
            const box = card.getBoundingClientRect()
            return [box.x, box.y]
          }))
        }
        if (!state.firstGraphFrame || time - state.firstGraphFrame < 1600) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await page.evaluate(() => import('/src/e2e-fixtures/agents-graph-layout.tsx'))
    await expect.poll(() => page.evaluate(() => (window as unknown as { graphFrames: number[][][] }).graphFrames.length)).toBeGreaterThan(10)
    await page.waitForFunction(() => {
      const state = window as unknown as { firstGraphFrame?: number }
      return state.firstGraphFrame && performance.now() - state.firstGraphFrame >= 1700
    })
    const movement = await page.evaluate(() => {
      const frames = (window as unknown as { graphFrames: number[][][] }).graphFrames
      return Math.max(...frames.flatMap(frame => frame.map((point, index) =>
        Math.hypot(point[0] - frames[0][index][0], point[1] - frames[0][index][1]))))
    })
    expect(movement, 'cards must open in their final positions without a settling animation').toBeLessThan(1)
    const graph = page.getByLabel('Agent reporting graph')
    await expect(graph).toHaveAttribute('data-graph-layout', 'solved')
    const boxes = await graph.evaluate(element => {
      const area = element.getBoundingClientRect()
      return [...element.querySelectorAll('[data-testid="agent-graph-node"]')].map(card => {
        const rect = card.getBoundingClientRect()
        return { left: rect.left - area.left, right: area.right - rect.right, top: rect.top - area.top,
          bottom: area.bottom - rect.bottom, x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      })
    })
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(width === 390 ? 24 : 64)
      expect(box.right).toBeGreaterThanOrEqual(width === 390 ? 24 : 64)
      expect(box.top).toBeGreaterThanOrEqual(24)
      expect(box.bottom).toBeGreaterThanOrEqual(24)
    }
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      expect(Math.abs(boxes[a].x - boxes[b].x) >= boxes[a].width + 16
        || Math.abs(boxes[a].y - boxes[b].y) >= boxes[a].height + 16).toBe(true)
    }
    await page.screenshot({ path: path.resolve(__dirname, `../../.jait/shots/agents-graph-stable-${width}.png`) })
    const positions = () => graph.locator('[aria-label^="Open "]').evaluateAll(elements => Object.fromEntries(elements.map(element => {
      const rect = element.getBoundingClientRect()
      return [element.getAttribute('aria-label'), [rect.x, rect.y]]
    })))
    const initial = await positions()
    await page.getByRole('button', { name: 'Refresh profiles' }).click()
    await expect.poll(positions).toEqual(initial)
    await page.getByRole('button', { name: 'Hide graph' }).click()
    await page.getByRole('button', { name: 'Show graph' }).click()
    await expect.poll(positions).toEqual(initial)
    if (width === 1440) {
      // Avatar dragging changes only that node, and profile refreshes keep user adjustments.
      const avatar = graph.getByRole('button', { name: 'Open Nova', exact: true })
      const avatarBounds = await avatar.boundingBox()
      await page.mouse.move(avatarBounds!.x + avatarBounds!.width / 2, avatarBounds!.y + avatarBounds!.height / 2)
      await page.mouse.down()
      await page.mouse.move(avatarBounds!.x + avatarBounds!.width / 2 + 50, avatarBounds!.y + avatarBounds!.height / 2 + 20, { steps: 8 })
      await page.mouse.up()
      await expect.poll(async () => (await positions())['Open Nova'][0]).toBeCloseTo(initial['Open Nova'][0] + 50, 0)
      await expect(page.getByLabel('Selected agent')).toHaveText('')
      const dragged = await positions()
      await page.getByRole('button', { name: 'Refresh profiles' }).click()
      await expect.poll(positions).toEqual(dragged)
      const graphBox = await graph.boundingBox()
      await page.mouse.move(graphBox!.x + graphBox!.width / 2, graphBox!.y + graphBox!.height - 20)
      await page.mouse.wheel(0, -120)
      await expect.poll(positions).not.toEqual(dragged)
      const zoomed = await positions()
      await page.getByRole('button', { name: 'Refresh profiles' }).click()
      await expect.poll(positions).toEqual(zoomed)
      await graph.getByRole('button', { name: 'Open Atlas', exact: true }).click()
      await expect(page.getByLabel('Selected agent')).toHaveText('atlas')
      await page.getByRole('button', { name: 'Toggle details' }).click()
      await expect(graph).toHaveAttribute('data-graph-layout', 'solved')
      const bounds = await graph.boundingBox()
      for (const card of await graph.getByTestId('agent-graph-node').all()) {
        const box = await card.boundingBox()
        expect(box!.x).toBeGreaterThanOrEqual(bounds!.x + 24)
        expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width - 24)
      }
    }
  })
}
