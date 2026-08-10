import { test, expect } from '@playwright/test'

test.describe('useChat stream resume lifecycle', () => {
  test('does not open duplicate resume streams on focus/pageshow/online while one is active', async ({ page }) => {
    await page.goto('/use-chat-resume-repro.html')

    await expect(page.getByRole('heading', { name: 'useChat Resume Repro' })).toBeVisible()
    await expect(page.getByTestId('stream-fetch-count')).toHaveText('1')
    await expect(page.getByTestId('loading')).toHaveText('true')
    await expect(page.getByTestId('history-loading')).toHaveText('false')
    await expect(page.getByTestId('message-count')).toHaveText('2')

    for (const eventName of ['focus', 'pageshow', 'online', 'visibilitychange'] as const) {
      await page.evaluate((name) => {
        if (name === 'visibilitychange') document.dispatchEvent(new Event(name))
        else if (name === 'pageshow') window.dispatchEvent(new PageTransitionEvent(name))
        else window.dispatchEvent(new Event(name))
      }, eventName)
      await page.waitForTimeout(100)
      await expect(page.getByTestId('stream-fetch-count'), `${eventName} should not restart the active stream`).toHaveText('1')
    }
  })
})
