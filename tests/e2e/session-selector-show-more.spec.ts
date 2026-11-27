import { expect, test, type Locator, type Page } from '@playwright/test'
import path from 'node:path'

// The order saved by an earlier drag, made when only the first five projects were loaded.
const savedOrder = ['project-3', 'project-1', 'project-2', 'project-5', 'project-4']

const projectIds = (page: Page) => page.locator('[data-dnd-key^="project:"]').evaluateAll(
  rows => rows.map(row => row.getAttribute('data-dnd-key')!.slice('project:'.length)),
)
const projectRow = (page: Page, id: string) => page.locator(`[data-dnd-key="project:${id}"]`)

async function openSidebar(page: Page, { order, touch = false }: { order?: string[]; touch?: boolean } = {}) {
  await page.setViewportSize({ width: 800, height: 1000 })
  if (order) {
    await page.addInitScript(ids => localStorage.setItem('jait.sidebar.manualOrder.v1', JSON.stringify({ projects: ids })), order)
  }
  await page.goto(`/src/e2e-fixtures/index.html${touch ? '?touch=1' : ''}`)
  await loadSidebar(page)
}

async function loadSidebar(page: Page) {
  await page.evaluate(() => import('/src/e2e-fixtures/session-selector-show-more.tsx'))
}

test('Show more projects reveals older projects below the arranged ones', async ({ page }) => {
  await openSidebar(page, { order: savedOrder })
  await expect.poll(() => projectIds(page)).toEqual(savedOrder)
  const arrangedTop = (await projectRow(page, 'project-3').boundingBox())!.y
  const arrangedLastTop = (await projectRow(page, 'project-4').boundingBox())!.y

  await page.getByRole('button', { name: 'Show more projects' }).click()

  const older = ['project-6', 'project-7', 'project-8', 'project-9', 'project-10']
  await expect.poll(() => projectIds(page)).toEqual([...savedOrder, ...older])
  // The arranged projects stay where they were; the revealed ones start under them.
  expect((await projectRow(page, 'project-3').boundingBox())!.y).toBe(arrangedTop)
  expect((await projectRow(page, 'project-6').boundingBox())!.y).toBeGreaterThan(arrangedLastTop)
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/session-selector-show-more.png') })

  // A further page is appended the same way.
  await page.getByRole('button', { name: 'Show more projects' }).click()
  await expect.poll(() => projectIds(page)).toEqual([...savedOrder, ...older, 'project-11', 'project-12'])
})

test('a project newer than the arranged ones still appears on top', async ({ page }) => {
  await openSidebar(page, { order: savedOrder })
  await expect.poll(() => projectIds(page)).toEqual(savedOrder)
  await page.getByRole('button', { name: 'Add newest project' }).click()

  // The first page holds five projects, so the least recently active one (project 5) drops off it.
  await expect.poll(() => projectIds(page)).toEqual(['project-new', 'project-3', 'project-1', 'project-2', 'project-4'])
})

test('project header actions collapse and expand projects with search-bar alignment', async ({ page }) => {
  await openSidebar(page)
  const sidebar = page.getByRole('complementary', { name: 'Projects and chats' })
  const header = sidebar.locator('[data-dnd-key="zone:root"]')
  const search = sidebar.getByRole('searchbox').locator('..')
  const collapse = header.getByRole('button', { name: 'Collapse projects', exact: true })
  const expand = header.getByRole('button', { name: 'Expand projects', exact: true })
  const project = projectRow(page, 'project-1')
  const chat = sidebar.locator('[data-dnd-key="session:Project chat-1"]')
  const personalChat = sidebar.locator('[data-dnd-key="session:Personal chat-1"]')

  await expect(chat).toBeVisible()
  await collapse.click()
  await expect(project).toBeVisible()
  await expect(chat).toHaveCount(0)
  await expect(personalChat).toBeVisible()
  const projectToggle = project.getByRole('button', { name: 'Expand project', exact: true })
  const projectBox = (await project.boundingBox())!
  const toggleBox = (await projectToggle.boundingBox())!
  const gripBox = (await project.locator('.lucide-grip-vertical').boundingBox())!
  const rowCenter = projectBox.y + projectBox.height / 2
  for (const box of [toggleBox, gripBox]) {
    expect(Math.abs(box.y + box.height / 2 - rowCenter)).toBeLessThan(0.5)
  }
  expect(toggleBox.x - (gripBox.x + gripBox.width)).toBeLessThanOrEqual(5)
  await projectToggle.click()
  await expect(chat).toBeVisible()
  await collapse.click()
  await page.reload()
  await loadSidebar(page)
  await expect(project).toBeVisible()
  await expect(chat).toHaveCount(0)
  await expand.click()
  await expect(chat).toBeVisible()

  const headerBox = (await header.boundingBox())!
  expect(headerBox.height).toBe((await search.boundingBox())!.height)
  for (const button of await header.getByRole('button').all()) {
    const box = (await button.boundingBox())!
    expect(Math.abs(box.y + box.height / 2 - (headerBox.y + headerBox.height / 2))).toBeLessThanOrEqual(1)
  }
  await page.mouse.move(400, 100)
  await sidebar.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/projects-header.png') })
})

for (const touch of [false, true]) {
  test(`reorders projects and chats with the ${touch ? 'touch' : 'desktop'} drag handler`, async ({ page }) => {
    await openSidebar(page, { touch })
    const chatRows = (prefix: string) => page.locator(`[data-dnd-key^="session:${prefix}-"]`)
    const chatRow = (name: string) => page.locator(`[data-dnd-key="session:${name}"]`)
    const chatIds = (prefix: string) => chatRows(prefix).evaluateAll(rows => rows.map(row => row.getAttribute('data-dnd-key')!.slice('session:'.length)))
    const drag = async (source: Locator, target: Locator, label: string, after: boolean) => {
      await target.scrollIntoViewIfNeeded()
      const bounds = (await target.boundingBox())!
      const position = { x: bounds.width / 2, y: bounds.height * (after ? 0.85 : 0.15) }
      if (!touch) {
        await source.dragTo(target, { targetPosition: position })
        return
      }
      const handle = (await source.getByRole('button', { name: `Drag ${label}`, exact: true }).boundingBox())!
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
      await page.mouse.down()
      await page.mouse.move(bounds.x + position.x, bounds.y + position.y, { steps: 5 })
      await expect(target).toHaveCSS('box-shadow', /inset/)
      await page.mouse.up()
    }

    await expect.poll(() => projectIds(page)).toEqual(['project-1', 'project-2', 'project-3', 'project-4', 'project-5'])
    await expect.poll(() => chatIds('Project chat')).toEqual(['Project chat-1', 'Project chat-2', 'Project chat-3'])
    await expect.poll(() => chatIds('Personal chat')).toEqual(['Personal chat-1', 'Personal chat-2', 'Personal chat-3'])

    await drag(projectRow(page, 'project-2'), projectRow(page, 'project-1'), 'Project 2', false)
    await drag(chatRow('Project chat-1'), chatRow('Project chat-3'), 'Project chat 1', true)
    await drag(chatRow('Personal chat-3'), chatRow('Personal chat-1'), 'Personal chat 3', false)

    const expectManualOrder = async () => {
      await expect.poll(() => projectIds(page)).toEqual(['project-2', 'project-1', 'project-3', 'project-4', 'project-5'])
      await expect.poll(() => chatIds('Project chat')).toEqual(['Project chat-2', 'Project chat-3', 'Project chat-1'])
      await expect.poll(() => chatIds('Personal chat')).toEqual(['Personal chat-3', 'Personal chat-1', 'Personal chat-2'])
    }
    await expectManualOrder()
    await page.reload()
    await loadSidebar(page)
    await expectManualOrder()
  })
}

test.describe('mobile status filters', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

  test('center each icon and reveal unread chats in collapsed projects', async ({ page }) => {
    await openSidebar(page, { touch: true })
    await page.setViewportSize({ width: 390, height: 844 })
    const project = projectRow(page, 'project-1')
    const chat = page.locator('[data-dnd-key="session:Project chat-1"]')
    await project.getByRole('button', { name: 'Collapse project', exact: true }).click()
    await expect(chat).toHaveCount(0)

    const filters = page.getByRole('group', { name: 'Filter chats by status' })
    for (const button of await filters.getByRole('button').all()) {
      const box = (await button.boundingBox())!
      const icon = (await button.locator('svg').boundingBox())!
      expect(box.width).toBeCloseTo(box.height)
      expect(icon.x + icon.width / 2).toBeCloseTo(box.x + box.width / 2)
      expect(icon.y + icon.height / 2).toBeCloseTo(box.y + box.height / 2)
    }

    await filters.getByRole('button', { name: 'Unread', exact: true }).click()
    await expect(chat).toBeVisible()
    await filters.getByRole('button', { name: 'All chats' }).click()
    await expect(chat).toHaveCount(0)
  })
})


test('forks appear below their parent in project and personal chats', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 760 })
  await page.goto('/src/e2e-fixtures/index.html?forks=1')
  await loadSidebar(page)
  const sidebar = page.getByRole('complementary', { name: 'Projects and chats' })
  const chatRow = (id: string) => sidebar.locator(`[data-dnd-key="session:${id}"]`)
  const expectChild = async (parent: string, child: string) => {
    await expect(chatRow(parent)).toBeVisible()
    await expect(chatRow(child)).toBeVisible()
    const parentBounds = (await chatRow(parent).boundingBox())!
    const childBounds = (await chatRow(child).boundingBox())!
    expect(childBounds.x).toBeGreaterThan(parentBounds.x)
    expect(childBounds.y).toBeGreaterThan(parentBounds.y)
    expect(childBounds.y - parentBounds.y - parentBounds.height).toBeLessThan(8)
  }
  await expectChild('Project chat-3', 'terminal-fork')
  await expectChild('terminal-fork', 'watcher-fork')
  await expectChild('Personal chat-3', 'manual-fork')
  await chatRow('manual-fork').click()
  await expect(chatRow('manual-fork')).toHaveClass(/bg-secondary/)
  await sidebar.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/session-sidebar-subchats.png') })
})
