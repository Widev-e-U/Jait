import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => { await page.goto('/mermaid-chat.html', { waitUntil: 'domcontentloaded' }) })

test('renders persisted MCP results inline and survives reload', async ({ page }) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const card = page.getByTestId('persisted')
    await expect(card.getByTestId('mermaid-tool-result')).toBeVisible()
    await expect(card.frameLocator('iframe').locator('svg')).toBeVisible()
    await expect(card.frameLocator('iframe').getByText('Developer', { exact: true })).toBeVisible()
    await card.getByText('Mermaid source', { exact: true }).click()
    await expect(card.locator('pre')).toContainText('TeamRoom-->Reviewer')
    if (attempt === 0) await page.reload({ waitUntil: 'domcontentloaded' })
  }
})

test('keeps a completed streaming diagram visible and replaces updated source', async ({ page }) => {
  const card = page.getByTestId('stream')
  await card.getByRole('button', { name: 'Finish diagram' }).click()
  await expect(card.frameLocator('iframe').locator('svg')).toBeVisible()
  const replacement = page.getByTestId('replace')
  await expect(replacement.frameLocator('iframe').getByText('Before', { exact: true })).toBeVisible()
  await replacement.getByRole('button', { name: 'Update source' }).click()
  await expect(replacement.frameLocator('iframe').getByText('After', { exact: true })).toBeVisible()
  await expect(replacement.frameLocator('iframe').getByText('Before', { exact: true })).toHaveCount(0)
})

test('shows parse errors and isolates untrusted diagram content', async ({ page }) => {
  const external: string[] = []
  page.on('request', request => { if (request.url().includes('example.invalid')) external.push(request.url()) })
  const dialogs: string[] = []
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss() })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('invalid').getByRole('alert')).toContainText('Diagram could not render')
  await expect(page.getByTestId('html').getByRole('alert')).toContainText('HTML tags are not supported')
  const untrusted = page.getByTestId('untrusted')
  await expect(untrusted.frameLocator('iframe').locator('svg')).toBeVisible()
  await expect(untrusted.locator('iframe')).toHaveAttribute('sandbox', '')
  await expect(untrusted.frameLocator('iframe').locator('script, [onerror], a[href^="javascript:"]')).toHaveCount(0)
  expect(dialogs).toEqual([])
  expect(external).toEqual([])
})
