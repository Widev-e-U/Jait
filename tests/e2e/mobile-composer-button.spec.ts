import { test, expect } from '@playwright/test'

test.describe('Mobile composer action dimensions', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })
  test('send and attach buttons keep square touch targets', async ({ page }) => {
    await page.route('**/api/team-rooms/fixture-room', route => route.fulfill({ json: {
      room: { id: 'fixture-room', name: 'Button sizing', rootAgentId: 'lead', goal: null },
      members: [], messages: [], deliveries: [],
    } }))
    await page.goto('/team-chat.html')
    await expect(page.getByRole('heading', { name: 'Button sizing' })).toBeVisible()
    await page.getByRole('textbox').fill('A mobile message')
    for (const name of ['Send message', 'Attach files']) {
      const button = page.getByRole('button', { name, exact: true })
      const bounds = await button.boundingBox()
      expect(bounds, name).not.toBeNull()
      console.log(`${name}: ${bounds!.width}×${bounds!.height}`)
      expect(bounds!.height, `${name} height`).toBe(44)
      expect(bounds!.width, `${name} width`).toBe(bounds!.height)
    }
    await page.screenshot({ path: 'test-results/mobile-composer-actions.png' })
  })
})
