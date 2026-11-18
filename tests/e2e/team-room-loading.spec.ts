import { test, expect } from '@playwright/test'

for (const mobile of [false, true]) {
  test(`team room keeps list identity while details load (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    await page.setViewportSize({ width: mobile ? 375 : 1280, height: 900 })
    const agents = [
      { id: 'dev', name: 'Developer', avatar: 'Atlas' },
      { id: 'qa', name: 'Reviewer', avatar: 'Nova' },
    ]
    const rooms = [
      { id: 'first', rootAgentId: 'dev', name: 'Implementation', memberIds: ['dev', 'qa'], goal: null },
      { id: 'second', rootAgentId: 'qa', name: 'Review', memberIds: ['qa'], goal: null },
    ]
    let release!: () => void
    const details = new Promise<void>(resolve => { release = resolve })
    await page.route('**/api/persona-agents', route => route.fulfill({ json: { agents } }))
    await page.route('**/api/team-rooms', route => route.fulfill({ json: { rooms } }))
    await page.route(/\/api\/team-rooms\/(first|second)$/, async route => {
      await details
      const room = rooms.find(room => route.request().url().endsWith('/' + room.id))!
      // A confirmed empty snapshot must override the list's earlier membership.
      await route.fulfill({ json: { room, members: [], messages: [], deliveries: [] } })
    })
    try {
      await page.goto('/team-chat.html?panelFixture=1')
      await page.getByRole('button', { name: 'Team Chats', exact: true }).click()
      const list = page.getByRole('navigation', { name: 'Team chat list' })
      const header = page.getByRole('region', { name: 'Team chats', exact: true }).locator('header').last()
      await list.getByRole('button').filter({ hasText: 'Implementation' }).click()
      await expect(header.getByRole('img', { name: 'Team: Developer, Reviewer', exact: true })).toBeVisible()
      await expect(header.getByRole('heading')).toHaveText('Implementation')
      await expect(header.locator('.team-avatar-empty')).toHaveCount(0)
      if (mobile) await page.getByRole('button', { name: 'Back to team chats' }).click()
      await list.getByRole('button').filter({ has: page.getByText('Review', { exact: true }) }).click()
      await expect(header.getByRole('img', { name: 'Team: Reviewer', exact: true })).toBeVisible()
      await expect(header.getByRole('heading')).toHaveText('Review')
      await expect(header.locator('[data-member-id="dev"]')).toHaveCount(0)
      release()
      await expect(header.getByRole('img', { name: 'Team: no members', exact: true })).toBeVisible()
      await expect(header.locator('[data-member-id]')).toHaveCount(0)
    } finally { release() }
  })
}

test('direct team room distinguishes loading membership from an empty team', async ({ page }) => {
  let release!: () => void
  const details = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/team-rooms/fixture-room', async route => {
    await details
    await route.fulfill({ json: {
      room: { id: 'fixture-room', name: 'Direct room', rootAgentId: 'dev', goal: null },
      members: [{ id: 'dev', name: 'Developer', avatar: 'Atlas' }], messages: [], deliveries: [],
    } })
  })
  try {
    await page.goto('/team-chat.html')
    const header = page.locator('header')
    await expect(header.getByRole('img', { name: 'Loading team members', exact: true })).toBeVisible()
    await expect(header.locator('.team-avatar-empty')).toHaveCount(0)
    release()
    await expect(header.getByRole('img', { name: 'Team: Developer', exact: true })).toBeVisible()
    await expect(header.getByRole('img', { name: 'Loading team members', exact: true })).toHaveCount(0)
  } finally { release() }
})
