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

  test('reconnects when the initial resume request never reaches a snapshot', async ({ page }) => {
    test.setTimeout(10_000)
    await page.goto('/use-chat-resume-repro.html?stall-first=1')

    await expect(page.getByTestId('stream-fetch-count')).toHaveText('1')
    await expect(page.getByTestId('history-loading')).toHaveText('true')

    await expect(page.getByTestId('stream-fetch-count')).toHaveText('2', { timeout: 5_000 })
    await expect(page.getByTestId('history-loading')).toHaveText('false')
    await expect(page.getByTestId('message-count')).toHaveText('2')
  })

  test('keeps exponential backoff across consecutive failed generations', async ({ page }) => {
    await page.goto('/use-chat-resume-repro.html?fail-first-two=1')

    await expect(page.getByTestId('stream-fetch-count')).toHaveText('3', { timeout: 3_000 })
    const fetchTimes = await page.evaluate(() => Reflect.get(window, '__resumeStreamFetchTimes') as number[])
    const firstDelay = fetchTimes[1] - fetchTimes[0]
    const secondDelay = fetchTimes[2] - fetchTimes[1]

    expect(firstDelay).toBeGreaterThanOrEqual(200)
    expect(firstDelay).toBeLessThan(450)
    expect(secondDelay).toBeGreaterThanOrEqual(450)
    expect(secondDelay).toBeLessThan(800)
  })

  test('reattaches an initial direct stream after session creation without reloading', async ({ page }) => {
    await page.addInitScript(() => {
      const originalSetTimeout = window.setTimeout.bind(window)
      window.setTimeout = ((handler, timeout = 0, ...args) => (
        originalSetTimeout(handler, timeout === 40_000 ? 100 : timeout, ...args)
      )) as typeof window.setTimeout
    })

    await page.goto('/use-chat-resume-repro.html?stall-initial-direct=1')

    await expect(page.getByTestId('direct-fetch-count')).toHaveText('1')
    await expect(page.getByTestId('stream-fetch-count')).toHaveText('1', { timeout: 5_000 })
    await expect(page.getByTestId('assistant-content')).toHaveText('latest content recovered without reload')
    await expect(page.getByTestId('loading')).toHaveText('false')
  })

  test('reconnects when an established streaming response stops receiving heartbeats', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/use-chat-resume-repro.html?stall-after-snapshot=1')

    await expect(page.getByTestId('stream-fetch-count')).toHaveText('1')
    await expect(page.getByTestId('history-loading')).toHaveText('false')
    await expect(page.getByTestId('message-count')).toHaveText('2')

    await page.waitForTimeout(41_000)

    expect(await page.evaluate(() => Reflect.get(window, '__resumeStreamFetchCount'))).toBe(2)
    await expect(page.getByTestId('history-loading')).toHaveText('false')
    await expect(page.getByTestId('message-count')).toHaveText('2')
  })
})
