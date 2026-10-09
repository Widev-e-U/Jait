import { test, expect } from '@playwright/test'

test('room goals start collapsed behind one control and persist independently for the session', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/team-rooms/*', route => {
    const id = new URL(route.request().url()).pathname.split('/').pop()
    return route.fulfill({ json: {
      room: { id, name: 'Goal room', rootAgentId: 'lead', goal: {
        status: 'active', description: 'Inspect this sprint goal', criteria: ['Verify membership', 'Verify keyboard access'],
      } },
      members: [], messages: [], deliveries: [],
    } })
  })
  await page.goto('/team-chat.html?roomId=goal-one')
  const panel = page.locator('details')
  const toggle = panel.locator('summary')
  await expect(toggle).toHaveCount(1)
  await expect(panel).not.toHaveAttribute('open')
  await expect(page.getByText('Inspect this sprint goal')).toBeHidden()
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(panel).toHaveAttribute('open', '')
  await expect(page.getByText('Inspect this sprint goal')).toBeVisible()
  await expect(page.getByText('Verify keyboard access')).toBeVisible()
  await page.reload()
  await expect(panel).toHaveAttribute('open', '')
  await page.goto('/team-chat.html?roomId=goal-two')
  await expect(panel).not.toHaveAttribute('open')
  await page.goto('/team-chat.html?roomId=goal-one')
  await expect(panel).toHaveAttribute('open', '')
  await toggle.click()
  await expect(panel).not.toHaveAttribute('open')
  await page.reload()
  await expect(panel).not.toHaveAttribute('open')
  const size = await toggle.boundingBox()
  expect(size?.height).toBeGreaterThanOrEqual(44)
})
