import path from 'node:path'
import { expect, test } from '@playwright/test'

for (const browser of [false, true]) {
  test(`desktop minimap shares the transcript height${browser ? ' with the browser panel floating above it' : ''}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.route('**/api/preview/session/viewport-fixture', route => route.fulfill({ json: { session: null } }))
    const fixture = path.resolve(__dirname, 'fixtures/conversation-stream-completion.html')
    await page.goto(`/@fs${fixture}?minimap${browser ? '&browser' : ''}`)
    const scroll = page.locator('[data-conversation-scroll]')
    const minimap = page.getByRole('slider', { name: 'Conversation minimap' })
    await expect(scroll).toBeVisible()
    await expect(minimap).toBeVisible()
    const assertLayout = async () => {
      await expect.poll(() => scroll.evaluate(el => el.clientHeight)).toBeGreaterThan(350)
      const viewport = (await scroll.boundingBox())!
      const rail = (await minimap.boundingBox())!
      expect(Math.abs(rail.y - viewport.y)).toBeLessThan(1)
      expect(Math.abs(rail.height - viewport.height)).toBeLessThan(1)
      expect(rail.x).toBeGreaterThanOrEqual(viewport.x + viewport.width - 1)
      if (browser) {
        const panel = (await page.getByRole('region', { name: 'Chat browser' }).boundingBox())!
        // The panel floats above the transcript, so it may not claim a row in
        // the column: both start at the top and the panel overlaps the chat
        // instead of pushing it down.
        expect(viewport.y).toBeLessThanOrEqual(panel.y + 1)
        expect(panel.y + panel.height).toBeGreaterThan(viewport.y + 80)
      }
    }
    await assertLayout()
    for (const action of ['Start reply', 'Grow reply', 'Finish reply']) {
      await page.getByRole('button', { name: action, exact: true }).click()
      await assertLayout()
    }
    // Allow ResizeObserver and virtualizer updates to settle; the rail must
    // never steal the transcript's height again on their next layout pass.
    const heights = await scroll.evaluate(async el => {
      const values: number[] = []
      for (let frame = 0; frame < 12; frame++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        values.push(el.clientHeight)
      }
      return values
    })
    expect(Math.min(...heights)).toBeGreaterThan(350)
  })
}
