import { test, expect } from '@playwright/test'

test.describe('useChat stream resume lifecycle', () => {
  test('does not open duplicate resume streams on focus/pageshow/online while one is active', async ({ page }) => {
    await page.goto('/use-chat-resume-repro.html')

    await expect(page.getByRole('heading', { name: 'useChat Resume Repro' })).toBeVisible()
    await expect(page.getByTestId('stream-fetch-count')).toHaveText('1')
    await expect(page.getByTestId('loading')).toHaveText('true')
    await expect(page.getByTestId('history-loading')).toHaveText('false')
    await expect(page.getByTestId('message-count')).toHaveText('2')

    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new PageTransitionEvent('pageshow'))
      window.dispatchEvent(new Event('online'))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await page.waitForTimeout(300)
    await expect(page.getByTestId('stream-fetch-count')).toHaveText('1')
  })
})
