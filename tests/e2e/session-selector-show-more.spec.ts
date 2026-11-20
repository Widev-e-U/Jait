import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

// The order saved by an earlier drag, made when only the first five projects were loaded.
const savedOrder = ['project-3', 'project-1', 'project-2', 'project-5', 'project-4']

const projectIds = (page: Page) => page.locator('[data-dnd-key^="project:"]').evaluateAll(
  rows => rows.map(row => row.getAttribute('data-dnd-key')!.slice('project:'.length)),
)
const projectRow = (page: Page, id: string) => page.locator(`[data-dnd-key="project:${id}"]`)

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1000 })
  await page.addInitScript(order => localStorage.setItem('jait.sidebar.manualOrder.v1', JSON.stringify({ projects: order })), savedOrder)
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/session-selector-show-more.tsx'))
  await expect.poll(() => projectIds(page)).toEqual(savedOrder)
})

test('Show more projects reveals older projects below the arranged ones', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Add newest project' }).click()

  // The first page holds five projects, so the least recently active one (project 5) drops off it.
  await expect.poll(() => projectIds(page)).toEqual(['project-new', 'project-3', 'project-1', 'project-2', 'project-4'])
})
