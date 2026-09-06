import path from 'node:path'
import { test, expect } from '@playwright/test'

const fixtureUrl = '/@fs' + path.resolve(__dirname, 'fixtures/git-change-indicators.html')

function status(insertions: number, deletions: number) {
  return {
    index: { files: [{ path: 'staged.ts', status: 'M' }], insertions, deletions },
    workingTree: { files: [{ path: 'untracked.ts', status: '?' }], insertions: 0, deletions: 0 },
  }
}

test('clears previous project totals while the next status is pending', async ({ page }) => {
  await page.route('**/api/git/status**', async route => {
    if (route.request().postDataJSON()?.cwd === '/project-b') return
    await route.fulfill({ json: status(12, 3) })
  })
  await page.goto(fixtureUrl)
  const indicator = page.getByRole('button', { name: /changed files\. Open editor/ })
  await expect(indicator).toHaveText('123')
  await page.getByRole('button', { name: 'Project B', exact: true }).click()
  await expect(indicator).toHaveText('0')
})

test('uses Git files for the badge and refreshes totals together', async ({ page }) => {
  let currentStatus = status(12, 3)
  await page.route('**/api/git/status**', route => route.fulfill({ json: currentStatus }))
  await page.goto(fixtureUrl)
  await expect(page.getByRole('button', { name: 'Changes', exact: true })).toHaveText('2Changes')
  await expect(page.getByRole('button', { name: '2 changed files. Open editor and source control.' })).toHaveText('123')
  currentStatus = { index: { files: [], insertions: 0, deletions: 0 }, workingTree: { files: [], insertions: 0, deletions: 0 } }
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Changes', exact: true })).toHaveText('Changes')
  await expect(page.getByRole('button', { name: '0 changed files. Open editor and source control.' })).toHaveText('0')
})
