import { test, expect } from '@playwright/test'

for (const kind of ['sessions', 'threads'] as const) {
test(`team identity reflects membership and confirmed ${kind} execution, respects reduced motion`, async ({ page }) => {
  let members = ['Nova', 'Cosmo', 'Atlas', 'Pixel', 'Sage', 'Bolt'].map((avatar, index) => ({ id: `agent-${index}`, name: avatar, avatar, paused: false }))
  let running = false
  let unavailable = false
  const room = { id: 'fixture-room', name: 'Avatar team', rootAgentId: 'agent-0', goal: null }
  const deliveries = [{ id: 'delivery', roomId: room.id, messageId: 'message', agentId: 'agent-0', sessionId: 'work', threadId: kind === 'threads' ? 'work-thread' : undefined, status: 'running', error: null }]
  await page.route('**/api/team-rooms/fixture-room', route => route.fulfill({ json: { room, members, messages: [], deliveries } }))
  await page.route(`**/api/${kind}/${kind === 'threads' ? 'work-thread' : 'work'}/runtime`, route => route.fulfill(unavailable ? { status: 503, json: {} } : { json: { running, startedAt: null } }))
  await page.goto('/team-chat.html')
  const avatar = page.getByRole('img', { name: /^Team:/ })
  await expect(avatar.locator('[data-member-id]')).toHaveCount(4)
  await expect(avatar).toContainText('+2')
  await expect(avatar.locator('[data-member-id="agent-0"] path').first()).toHaveAttribute('fill', '#a78bfa')
  await expect(avatar).toHaveAccessibleName('Team: Nova, Cosmo, Atlas, Pixel, Sage, Bolt')
  await expect(avatar.locator('.agent-creature-working')).toHaveCount(0)
  const body = avatar.locator('[data-member-id="agent-0"] .agent-creature-body')
  await expect.poll(() => body.evaluate(element => getComputedStyle(element).animationName)).toBe('none')
  await page.screenshot({ path: 'test-results/team-avatar-cluster.png' })
  running = true
  await expect(avatar.locator('.agent-creature-working')).toHaveCount(1)
  await expect.poll(() => body.evaluate(element => getComputedStyle(element).animationName)).toBe('agent-work')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => body.evaluate(element => getComputedStyle(element).animationName)).toBe('none')
  unavailable = true
  await expect(avatar.locator('.agent-creature-working')).toHaveCount(0)
  unavailable = false; running = false
  members = [{ id: 'new', name: 'New teammate', avatar: 'Pixel', paused: false }, members[0]]
  await expect(avatar).toHaveAccessibleName('Team: New teammate, Nova')
  await expect(avatar.locator('[data-member-id]')).toHaveCount(2)
  await expect(avatar.locator('.team-avatar-more')).toHaveCount(0)
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(avatar).toBeVisible()
  expect(await avatar.evaluate(element => element.getBoundingClientRect().width)).toBe(48)
  await page.screenshot({ path: 'test-results/team-avatar-mobile.png' })
  members = []
  await expect(avatar).toHaveAccessibleName('Team: no members')
})
}
