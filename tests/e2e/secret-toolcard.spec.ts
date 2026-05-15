import { test, expect } from '@playwright/test'

test.describe('secret prompt tool cards', () => {
  test('renders terminal SSH password prompts inline inside the running tool card', async ({ page }) => {
    await page.goto('/secret-toolcard-repro.html')

    await expect(page.getByRole('heading', { name: 'Secret Toolcard Repro' })).toBeVisible()
    await expect(page.getByRole('button', { name: /\$ ssh jakob@host/ })).toBeVisible()

    const form = page.getByTestId('inline-secret-form')
    await expect(form).toBeVisible()
    await expect(form.getByText('SSH password')).toBeVisible()
    await expect(form.getByText('This prompt is attached to the running tool call.')).toBeVisible()
    await expect(form.getByText('Password for jakob@host')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await form.getByLabel('Secret').fill('remote-password')
    await form.getByRole('button', { name: 'Submit' }).click()

    await expect(page.getByTestId('submitted-secret')).toHaveText('submitted:remote-password')
  })
})
