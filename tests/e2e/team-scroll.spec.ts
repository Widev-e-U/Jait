import { test, expect } from '@playwright/test'

test('team conversation follows content growth, lets readers detach, and resumes on jump', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const makeMessage = (id: number) => ({
    id: String(id), roomId: 'fixture-room',
    sender: { kind: 'agent', id: 'lead', name: 'Actual agent', avatar: 'Atlas' },
    content: 'Message ' + id + '\n' + 'Earlier output for reading. '.repeat(10),
    kind: 'discussion', recipientIds: [], createdAt: '2026-10-07T09:00:00Z', depth: 0,
  })
  const messages = Array.from({ length: 24 }, (_, i) => makeMessage(i))
  await page.route('**/api/team-rooms/fixture-room', route => route.fulfill({ json: {
    room: { id: 'fixture-room', name: 'Scroll room', rootAgentId: 'lead', goal: null },
    members: [{ id: 'lead', name: 'Actual agent', avatar: 'Atlas' }], messages, deliveries: [],
  } }))
  await page.goto('/team-chat.html')
  const log = page.getByRole('log', { name: 'Team conversation' })
  const distance = () => log.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)
  await expect(page.getByTestId('team-message')).toHaveCount(24)
  await expect.poll(distance).toBeLessThan(5)
  await log.hover()
  await page.mouse.wheel(0, -700)
  await expect.poll(distance).toBeGreaterThan(100)
  const readingTop = await log.evaluate(el => el.scrollTop)
  messages.push(makeMessage(24))
  await expect(page.getByTestId('team-message')).toHaveCount(25)
  expect(Math.abs((await log.evaluate(el => el.scrollTop)) - readingTop)).toBeLessThan(5)
  const jump = page.getByRole('button', { name: 'Jump to latest messages' })
  await expect(jump).toBeVisible()
  await jump.click()
  await expect.poll(distance).toBeLessThan(5)
  messages[24].content += '\n' + 'Incremental output keeps the actual sender.\n'.repeat(12)
  await expect(page.getByTestId('team-message').last()).toContainText('Incremental output')
  await expect.poll(distance).toBeLessThan(5)
  await expect(page.getByTestId('team-message').last().getByText('Actual agent', { exact: true })).toBeVisible()
  await expect(page.getByTestId('team-message').last().locator('.agent-creature')).toHaveCount(1)
})
