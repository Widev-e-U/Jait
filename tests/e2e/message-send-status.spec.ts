import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function geometry(page: Page) {
  return page.locator('[data-testid^="message-"] [data-message-from="user"]').evaluateAll(elements =>
    elements.filter(el => el.classList.contains('border')).map(el => {
      const { x, y, width, height } = el.getBoundingClientRect()
      return { x, y, width, height }
    }),
  )
}

async function mobileMenuGeometry(page: Page) {
  return page.locator('[data-testid^="message-"] button[aria-label="Message actions"]').evaluateAll(elements => elements.map(el => {
    const { x, y, width, height } = el.getBoundingClientRect()
    return { x, y, width, height }
  }))
}

for (const width of [320, 393, 1280]) {
  test(`send status preserves message geometry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/src/e2e-fixtures/index.html', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => import('/src/e2e-fixtures/message-send-status.tsx'))
    await expect(page.getByText('Following reply', { exact: true })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const baseline = await geometry(page)
    expect(baseline).toHaveLength(3)
    const menus = width < 768 ? await mobileMenuGeometry(page) : []
    const following = await page.getByTestId('following-message').boundingBox()
    await page.getByRole('button', { name: 'Start sending', exact: true }).click()
    const statuses = page.getByTestId('user-message-send-status')
    await expect(statuses).toHaveCount(3)
    for (let index = 0; index < 3; index++) {
      const bubble = page.getByTestId(`message-${index}`).locator('[data-message-from="user"]').last()
      await page.getByTestId(`message-${index}`).locator('[data-message-from="user"]').first().hover({ position: { x: 1, y: 1 } })
      const layout = await bubble.evaluate((el, mobile) => {
        const rect = el.getBoundingClientRect()
        const status = el.parentElement!.querySelector('[data-testid="user-message-send-status"]')!.getBoundingClientRect()
        const text = el.firstElementChild!.getBoundingClientRect()
        const button = el.parentElement!.querySelector('button')!
        const actions = button.getBoundingClientRect()
        const dots = button.querySelector('svg')!.getBoundingClientRect()
        return {
          inside: status.x >= rect.x && status.right <= rect.right && status.bottom <= rect.bottom,
          rightGap: rect.right - status.right,
          bottomGap: rect.bottom - status.bottom,
          clearText: status.top >= text.bottom,
          clearActions: mobile ? status.right <= actions.left : status.top >= actions.bottom,
          visualGap: dots.left - status.right,
          centerOffset: Math.abs((dots.top + dots.bottom - status.top - status.bottom) / 2),
        }
      }, width < 768)
      expect(layout.inside).toBe(true)
      expect(layout.rightGap).toBeLessThanOrEqual(width < 768 ? 18 : 10)
      expect(layout.bottomGap).toBeLessThanOrEqual(2)
      expect(layout.clearText).toBe(true)
      expect(layout.clearActions).toBe(true)
      if (width < 768) {
        expect(layout.visualGap).toBeGreaterThanOrEqual(0)
        expect(layout.visualGap).toBeLessThanOrEqual(3)
        expect(layout.centerOffset).toBeLessThan(0.5)
      }
    }
    expect(await geometry(page)).toEqual(baseline)
    if (width < 768) expect(await mobileMenuGeometry(page)).toEqual(menus)
    expect(await page.getByTestId('following-message').boundingBox()).toEqual(following)
    if (width < 768) {
      await page.getByTestId('message-1').getByRole('button', { name: 'Message actions', exact: true }).click()
      await expect(page.getByRole('menuitem', { name: 'Copy message', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await page.getByTestId('message-1').screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `message-send-status-row-${width}.png`) })
    }
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `message-send-status-${width}.png`) })
    await page.getByRole('button', { name: 'Confirm sent', exact: true }).click()
    await expect(statuses.first()).toHaveAttribute('data-send-state', 'sent')
    expect(await geometry(page)).toEqual(baseline)
    if (width < 768) expect(await mobileMenuGeometry(page)).toEqual(menus)
    await expect(statuses).toHaveCount(0)
    expect(await geometry(page)).toEqual(baseline)
    if (width < 768) expect(await mobileMenuGeometry(page)).toEqual(menus)
    expect(await page.getByTestId('following-message').boundingBox()).toEqual(following)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })
}
