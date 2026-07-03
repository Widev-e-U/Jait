import { test, expect, type Page } from '@playwright/test'

async function runMode(page: Page, mode: 'immediate' | 'raf') {
  await page.goto(`/use-chat-burst-repro.html?mode=${mode}`)
  await expect(page.getByRole('heading', { name: 'useChat Burst Repro' })).toBeVisible()
  await expect(page.getByTestId('done')).toHaveText('true', { timeout: 10000 })

  return {
    mode,
    thinkingLength: Number(await page.getByTestId('thinking-length').textContent()),
    commitCount: Number(await page.getByTestId('commit-count').textContent()),
  }
}

test.describe('useChat burst stream rendering', () => {
  test('rAF batching sharply reduces commits through the real message/tool-card renderer', async ({ page }) => {
    const immediate = await runMode(page, 'immediate')
    const raf = await runMode(page, 'raf')

    console.log(JSON.stringify({ immediate, raf }))

    expect(immediate.thinkingLength).toBeGreaterThan(600)
    expect(raf.thinkingLength).toBe(immediate.thinkingLength)
    expect(raf.commitCount).toBeLessThan(immediate.commitCount / 2)
  })
})
