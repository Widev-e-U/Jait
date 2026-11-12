import { expect, test } from '@playwright/test'
import path from 'node:path'

for (const collapsed of [false, true]) {
  test(`sidebar moves excess items into menus when ${collapsed ? 'collapsed' : 'expanded'}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 })
    await page.addInitScript(value => localStorage.setItem('jait.navigationSidebarCollapsed', String(value)), collapsed)
    await page.goto('/src/e2e-fixtures/index.html')
    await page.evaluate(() => import('/src/e2e-fixtures/sidebar-overflow.tsx'))
    const sidebar = page.getByRole('complementary', { name: 'Workspace sidebar' })
    const navigation = sidebar.getByRole('navigation', { name: 'Main navigation' })
    const tools = sidebar.getByRole('navigation', { name: 'Workspace tools' })
    const moreNavigation = navigation.getByRole('button', { name: 'More navigation options' })
    const moreTools = tools.getByRole('button', { name: 'More workspace tools' })
    await expect(tools.getByRole('button', { name: 'Preview', exact: true })).toBeVisible()
    await expect(moreNavigation).toHaveCount(0)
    await expect(moreTools).toHaveCount(0)

    await page.setViewportSize({ width: 1280, height: 520 })
    await expect(moreNavigation).toBeVisible()
    await expect(moreTools).toBeVisible()
    await expect(tools.getByRole('button', { name: 'Preview', exact: true })).toHaveCount(0)
    await expect(sidebar.getByRole('button', { name: 'Account menu' })).toBeInViewport()
    await expect(sidebar.getByRole('button', { name: 'Trajectory', exact: true })).toBeInViewport()
    await expect.poll(() => sidebar.locator('nav').evaluateAll(elements => elements.every(element =>
      element.scrollHeight <= element.clientHeight + 1 && getComputedStyle(element).overflowY !== 'auto'
    ))).toBe(true)

    await moreNavigation.focus()
    await page.keyboard.press('Enter')
    const navMenu = page.getByRole('menu', { name: 'More navigation options' })
    await expect(navMenu).toBeVisible()
    await navMenu.getByRole('menuitem', { name: 'Network' }).click()
    await expect(page.getByLabel('Last action')).toHaveText('network')
    await expect(navMenu).toBeHidden()
    const sidebarBounds = await sidebar.boundingBox()
    await moreTools.click()
    const toolsMenu = page.getByRole('menu', { name: 'More workspace tools' })
    await expect(toolsMenu.getByRole('menuitem', { name: /Architecture/ })).toBeDisabled()
    const preview = toolsMenu.getByRole('menuitem', { name: /Preview/ })
    await expect(preview).toHaveAttribute('aria-current', 'page')
    await expect(preview).toContainText('5')
    await expect(preview).toContainText('Open the live app')
    await expect.poll(async () => (await toolsMenu.boundingBox())!.x).toBeGreaterThanOrEqual(sidebarBounds!.x + sidebarBounds!.width)
    const menuBounds = await toolsMenu.boundingBox()
    expect(menuBounds!.y).toBeGreaterThanOrEqual(0)
    expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(520)
    await page.screenshot({ path: path.resolve(__dirname, `../../.jait/shots/sidebar-overflow-${collapsed ? 'collapsed' : 'expanded'}.png`) })
    await preview.click()
    await expect(page.getByLabel('Last action')).toHaveText('Preview')
    await moreTools.click()
    await page.keyboard.press('Escape')
    await expect(toolsMenu).toBeHidden()
    await expect(moreTools).toBeFocused()

    // New tool entries are included without requiring a resize.
    await page.getByRole('button', { name: 'Toggle extra tool' }).click()
    await moreTools.click()
    await toolsMenu.getByRole('menuitem', { name: 'Extra tool' }).click()
    await expect(page.getByLabel('Last action')).toHaveText('Extra tool')
    await page.setViewportSize({ width: 1280, height: 1200 })
    await expect(moreTools).toHaveCount(0)
    await expect(moreNavigation).toHaveCount(0)
    await expect(tools.getByRole('button', { name: 'Extra tool' })).toBeVisible()
    await expect(navigation.getByRole('button', { name: 'Network' })).toBeVisible()

    // Changing rail width also recalculates the available space.
    await page.setViewportSize({ width: 1280, height: 420 })
    await expect(moreTools).toBeVisible()
    await sidebar.getByRole('button', { name: collapsed ? 'Expand sidebar' : 'Collapse sidebar' }).click()
    await expect(moreTools).toBeVisible()
    await expect(sidebar.getByRole('button', { name: 'Account menu' })).toBeInViewport()
  })
}

test('collapsed update button aligns with the other sidebar controls', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('jait.navigationSidebarCollapsed', 'true'))
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/sidebar-overflow.tsx'))
  const sidebar = page.getByRole('complementary', { name: 'Workspace sidebar' })
  const update = sidebar.getByRole('button', { name: 'Update to v99.0.0' })
  const trajectory = sidebar.getByRole('button', { name: 'Trajectory', exact: true })
  const account = sidebar.getByRole('button', { name: 'Account menu' })
  await expect(update).toBeVisible()
  const centerX = async (locator: typeof update) => {
    const bounds = (await locator.boundingBox())!
    return bounds.x + bounds.width / 2
  }
  for (const width of [1280, 640]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(async () => Math.abs(await centerX(update) - await centerX(trajectory))).toBeLessThan(0.5)
    await expect.poll(async () => Math.abs(await centerX(update) - await centerX(account))).toBeLessThan(0.5)
  }
  await sidebar.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/sidebar-update-alignment.png') })
  await update.click()
  await expect(page.getByLabel('Last action')).toHaveText('Update')
})
