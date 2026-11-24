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
