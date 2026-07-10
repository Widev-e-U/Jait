import { test, expect, type Page } from '@playwright/test'

async function runMode(page: Page, mode: 'legacy' | 'raf') {
  await page.goto(`/use-chat-burst-repro.html?mode=${mode}`)
  await expect(page.getByRole('heading', { name: 'useChat Burst Repro' })).toBeVisible()
  await expect(page.getByTestId('done')).toHaveText('true', { timeout: 10000 })

  return {
    mode,
    thinkingLength: Number(await page.getByTestId('thinking-length').textContent()),
    commitCount: Number(await page.getByTestId('commit-count').textContent()),
    contentCommitCount: Number(await page.getByTestId('content-commit-count').textContent()),
    contentLength: Number(await page.getByTestId('content-length').textContent()),
    elapsedMs: Number(await page.getByTestId('elapsed-ms').textContent()),
  }
}

test.describe('useChat burst stream rendering', () => {
  test('synchronous ingest avoids the legacy frame-per-event drain through the real renderer', async ({ page }) => {
    const legacy = await runMode(page, 'legacy')
    const raf = await runMode(page, 'raf')

    console.log(JSON.stringify({ legacy, raf }))

    expect(legacy.thinkingLength).toBeGreaterThan(300)
    expect(raf.thinkingLength).toBe(legacy.thinkingLength)
    expect(legacy.contentLength).toBeGreaterThan(500)
    expect(raf.contentLength).toBe(legacy.contentLength)
    expect(legacy.contentCommitCount).toBe(90)
    expect(raf.contentCommitCount).toBeLessThan(legacy.contentCommitCount / 4)
    expect(raf.commitCount).toBeLessThan(legacy.commitCount / 4)
    expect(raf.elapsedMs).toBeLessThan(legacy.elapsedMs / 4)
  })
})
