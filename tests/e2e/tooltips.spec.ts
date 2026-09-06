import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/tooltip-repro.html')
})

test('opens quickly, closes immediately, and preserves clicks', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const first = page.getByRole('button', { name: 'First', exact: true })
  await first.hover()
  await expect(page.getByRole('tooltip')).toHaveText('First hint', { timeout: 250 })
  const content = page.locator('[data-slot="tooltip-content"]')
  await expect(content).toHaveCSS('animation-duration', '0.075s')
  await expect(content).toHaveCSS('transform', 'none')
  await first.click()
  await expect(page.getByLabel('Clicks')).toHaveText('1')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.getByRole('button', { name: 'Second', exact: true }).hover()
  await expect(page.getByRole('tooltip')).toHaveText('Second hint', { timeout: 250 })
  await page.mouse.move(1, 1, { steps: 10 })
  await expect(page.getByRole('tooltip')).toHaveCount(0, { timeout: 250 })
  expect(errors).toEqual([])
  await expect(page.locator('[title]')).toHaveCount(0)
})

test('supports keyboard focus, Escape, and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.keyboard.press('Tab')
  await expect(page.getByRole('tooltip')).toHaveText('First hint')
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveCSS('animation-name', 'none')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('tooltip')).toHaveText('Second hint')
})

test('composes with menu triggers without breaking refs or actions', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  await menu.hover()
  await expect(page.getByRole('tooltip')).toHaveText('Menu hint')
  await menu.click()
  await page.getByRole('menuitem', { name: 'Choose' }).click()
  await expect(page.getByLabel('Clicks')).toHaveText('1')
  await expect(page.getByRole('menu')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('shows disabled-control hints and handles dynamic and standalone content', async ({ page }) => {
  await page.getByRole('button', { name: 'Unavailable', exact: true }).hover({ force: true })
  await expect(page.getByRole('tooltip')).toHaveText('Unavailable hint')
  const dynamic = page.getByRole('button', { name: 'Dynamic', exact: true })
  await dynamic.click()
  await page.mouse.move(1, 1)
  await dynamic.hover()
  await expect(page.getByRole('tooltip')).toHaveText('Updated hint')
  await dynamic.click()
  await page.mouse.move(1, 1)
  await dynamic.hover()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.getByRole('button', { name: 'Standalone', exact: true }).hover()
  await expect(page.getByRole('tooltip')).toHaveText('Standalone hint')
})
