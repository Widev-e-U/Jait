import { test, expect } from '@playwright/test'

test('pasted images with the same clipboard filename survive repeated and batch pastes', async ({ page }) => {
  let submitted: { attachments: Array<{ name: string; data: string; mimeType: string }> } | undefined
  await page.route('**/api/team-rooms/*', route => route.fulfill({ json: {
    room: { id: 'fixture-room', name: 'Paste team', rootAgentId: 'lead' },
    members: [], messages: [], deliveries: [],
  } }))
  await page.route('**/api/team-rooms/fixture-room/messages', async route => {
    submitted = route.request().postDataJSON()
    await route.fulfill({ json: { message: { id: 'sent' } } })
  })
  await page.goto('/team-chat.html', { waitUntil: 'domcontentloaded' })
  const input = page.locator('[contenteditable="true"]')
  await expect(input).toBeEnabled()
  const paste = async (colors: string[]) => input.evaluate(async (element, colors) => {
    const clipboardData = new DataTransfer()
    for (const color of colors) {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 2
      const context = canvas.getContext('2d')!
      context.fillStyle = color
      context.fillRect(0, 0, 2, 2)
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!)))
      clipboardData.items.add(new File([blob], 'image.png', { type: 'image/png' }))
    }
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  }, colors)
  await paste(['red'])
  await expect(page.getByRole('button', { name: 'Remove image.png', exact: true })).toBeVisible()
  await paste(['blue'])
  await expect(page.getByRole('button', { name: 'Remove image (2).png', exact: true })).toBeVisible()
  await paste(['green', 'yellow'])
  await expect(page.getByRole('button', { name: 'Remove image (4).png', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Remove image (2).png', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove image.png', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove image (3).png', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect.poll(() => submitted?.attachments.length).toBe(3)
  expect(submitted!.attachments.map(file => file.name)).toEqual(['image.png', 'image (3).png', 'image (4).png'])
  expect(new Set(submitted!.attachments.map(file => file.data)).size).toBe(3)
  expect(submitted!.attachments.every(file => file.mimeType === 'image/png')).toBe(true)
})

test('long team goals stay compact and scroll without crowding the conversation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/team-rooms/*', route => route.fulfill({ json: {
    room: { id: 'fixture-room', name: 'Compact team', rootAgentId: 'lead', goal: {
      status: 'active', description: 'A detailed sprint goal. '.repeat(50),
      criteria: Array.from({ length: 12 }, (_, index) => 'Criterion ' + index + ': ' + 'Detailed acceptance requirement. '.repeat(12)),
    } },
    members: [], messages: [], deliveries: [],
  } }))
  await page.goto('/team-chat.html', { waitUntil: 'domcontentloaded' })
  const goal = page.locator('details').first()
  await expect(goal.locator('summary')).toBeVisible()
  expect((await goal.boundingBox())!.height).toBeLessThanOrEqual(48)
  await goal.locator('summary').click()
  await expect(goal).toHaveAttribute('open', '')
  expect((await goal.boundingBox())!.height).toBeLessThan(240)
  const content = goal.getByTestId('team-goal-content')
  expect(await content.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)
  await expect(page.locator('[contenteditable="true"]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
