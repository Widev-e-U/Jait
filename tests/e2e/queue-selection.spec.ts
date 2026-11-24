import { expect, test, type Page } from '@playwright/test'

async function openQueue(page: Page) {
  await page.goto('/src/e2e-fixtures/index.html', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => import('/src/e2e-fixtures/queue-selection.tsx'))
}

const queueOrder = (page: Page) => page.locator('[data-queue-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-queue-id')))
const transcriptPosition = (page: Page) => page.locator('[data-conversation-scroll]').evaluate(el => ({
  top: el.scrollTop,
  height: el.scrollHeight,
  bottomGap: el.scrollHeight - el.clientHeight - el.scrollTop,
}))

for (const width of [390, 1280]) {
  test(`single queued message expands without dragging or shifting transcript at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openQueue(page)
    const row = page.locator('[data-queue-id="single"]')
    await expect(row).toBeVisible()
    await page.waitForTimeout(700)
    const before = await row.boundingBox()
    await row.getByText(/Queued detail 0/).click()
    await expect(row.getByRole('button', { name: 'Collapse queued message' })).toBeVisible()
    await expect(row).not.toHaveClass(/opacity-0/)
    await expect(row.getByLabel('Drag to reorder')).toHaveCount(0)
    await page.waitForTimeout(650)
    const after = await row.boundingBox()
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(3)
    await row.getByRole('button', { name: 'Collapse queued message' }).click()
    await expect(row.getByRole('button', { name: 'Expand queued message' })).toBeVisible()
    await row.getByRole('button', { name: 'Edit message' }).click()
    const editor = row.locator('[data-queue-editor]').getByRole('textbox')
    await editor.fill('Discard this edit')
    await row.getByRole('button', { name: 'Cancel editing message' }).click()
    await expect(row.getByText(/Queued detail 0/)).toBeVisible()
    await row.getByRole('button', { name: 'Edit message' }).click()
    await editor.fill('Updated message')
    await row.getByRole('button', { name: 'Save changes' }).click()
    await expect(row.getByText('Updated message', { exact: true })).toBeVisible()
  })

  test(`drag stays within the queue and keeps the transcript steady at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openQueue(page)
    await page.getByRole('button', { name: 'Add second' }).click()
    const first = page.locator('[data-queue-id="single"]')
    const second = page.locator('[data-queue-id="second"]')
    const grip = first.getByRole('button', { name: 'Drag to reorder' })
    await expect(grip).toBeInViewport()
    await expect(second).toBeInViewport()
    await expect.poll(async () => (await transcriptPosition(page)).bottomGap).toBeLessThan(1)

    const before = await transcriptPosition(page)
    const start = (await grip.boundingBox())!
    const target = (await second.boundingBox())!
    const x = start.x + start.width / 2
    const y = start.y + start.height / 2
    const dropY = target.y + target.height - 2

    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, dropY, { steps: 8 })
    await expect(second).toHaveAttribute('data-queue-drop', 'after')
    expect(await queueOrder(page)).toEqual(['single', 'second'])
    expect(await transcriptPosition(page)).toEqual(before)

    await page.mouse.move(x, y - 240, { steps: 8 })
    await expect(page.locator('[data-queue-drop]')).toHaveCount(0)
    expect((await grip.boundingBox())!.y).toBeCloseTo(start.y, 0)
    expect(await transcriptPosition(page)).toEqual(before)
    await page.mouse.up()
    expect(await queueOrder(page)).toEqual(['single', 'second'])

    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, dropY, { steps: 8 })
    await page.mouse.up()
    await expect.poll(() => queueOrder(page)).toEqual(['second', 'single'])
    expect(await transcriptPosition(page)).toEqual(before)
  })
}

test.describe('touch reorder', () => {
  test.use({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true })

  test('a downward drag reorders without detaching from new transcript content', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Uses Chromium touch input')
    await openQueue(page)
    await page.getByRole('button', { name: 'Add second' }).tap()
    const grip = page.locator('[data-queue-id="single"]').getByRole('button', { name: 'Drag to reorder' })
    const second = page.locator('[data-queue-id="second"]')
    await expect(grip).toBeInViewport()
    await expect(second).toBeInViewport()
    await expect.poll(async () => (await transcriptPosition(page)).bottomGap).toBeLessThan(1)

    const before = await transcriptPosition(page)
    const start = (await grip.boundingBox())!
    const target = (await second.boundingBox())!
    const cdp = await context.newCDPSession(page)
    const x = start.x + start.width / 2
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: start.y + start.height / 2 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: target.y + target.height - 2 }] })
    await expect(second).toHaveAttribute('data-queue-drop', 'after')
    expect(await transcriptPosition(page)).toEqual(before)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(() => queueOrder(page)).toEqual(['second', 'single'])

    await page.getByRole('button', { name: 'Grow transcript' }).press('Enter')
    await expect(page.getByText('Transcript 11', { exact: true })).toHaveCSS('height', '260px')
    await expect.poll(async () => (await transcriptPosition(page)).height).toBeGreaterThan(before.height + 100)
    await expect.poll(async () => (await transcriptPosition(page)).bottomGap).toBeLessThan(1)
  })
})
