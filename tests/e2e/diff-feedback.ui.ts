import { expect, test } from '@playwright/test'

test('sends selected diff feedback to the thread and keeps a rejected draft', async ({ page }) => {
  await page.route('**/api/git/file-diffs', route => route.fulfill({ json: { files: [{ path: 'src/file.ts', status: 'M', original: 'one\nold\nthree', modified: 'one\nnew\nthree' }] } }))
  const messages: string[] = []
  await page.route('**/api/threads/thread-1/send', async route => {
    messages.push(route.request().postDataJSON().message)
    await route.fulfill(messages.length === 1 ? { status: 409, json: { error: 'A turn is already in progress' } } : { json: { ok: true } })
  })
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/diff-feedback.tsx'))
  await page.getByRole('button', { name: 'Select modified line 2' }).click()
  await expect(page.getByText('Modified line 2', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add feedback' }).click()
  await page.getByLabel('Review feedback').fill('Please revise this line')
  await page.getByRole('button', { name: 'Send to thread' }).click()
  await expect(page.getByLabel('Review feedback')).toHaveValue('Please revise this line')
  await page.getByRole('button', { name: 'Send to thread' }).click()
  await expect(page.getByLabel('Review feedback')).toHaveCount(0)
  expect(messages).toHaveLength(2)
  expect(messages[1]).toContain('File: "src/file.ts"')
  expect(messages[1]).toContain('Lines: 2\n')
  expect(messages[1]).toContain('Captured source lines: "new"')
  expect(messages[1]).toContain('Feedback: Please revise this line')
})
