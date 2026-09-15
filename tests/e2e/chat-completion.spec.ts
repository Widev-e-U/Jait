import { test, expect } from '@playwright/test'

for (const changed of [false, true]) {
  test(`completion validates ${changed ? 'changed' : 'unchanged'} history without reloading`, async ({ page }) => {
    await page.goto(`/chat-completion-repro.html${changed ? '?changed' : ''}`)
    await expect(page.getByTestId('assistant-1')).toHaveText('Answer')
    await page.evaluate(() => {
      const oldNode = document.querySelector('[data-testid="user-1"]')!
      ;(window as any).__oldNode = oldNode
      ;(window as any).__cleared = false
      new MutationObserver(() => {
        if (!oldNode.isConnected || document.querySelector('[data-testid="loading"]')?.textContent === 'true') (window as any).__cleared = true
      }).observe(document.body, { subtree: true, childList: true, characterData: true })
    })
    await page.getByRole('button', { name: 'Complete', exact: true }).click()
    await expect(page.getByTestId('streaming')).toHaveText('false')
    await expect(page.getByTestId('assistant-1')).toHaveText(changed ? 'Saved correction' : 'Answer')
    await page.getByRole('button', { name: 'Counts', exact: true }).click()
    await expect(page.getByTestId('counts')).toHaveText('{"snapshots":2,"subscriptions":1}')
    expect(await page.evaluate(() => (window as any).__cleared)).toBe(false)
    expect(await page.evaluate(() => (window as any).__oldNode === document.querySelector('[data-testid="user-1"]'))).toBe(true)
  })
}

test('late validation cannot overwrite a newer streamed turn', async ({ page }) => {
  await page.goto('/chat-completion-repro.html?delay&changed')
  await expect(page.getByTestId('assistant-1')).toHaveText('Answer')
  await page.getByRole('button', { name: 'Complete', exact: true }).click()
  await page.getByRole('button', { name: 'Counts', exact: true }).click()
  await expect(page.getByTestId('counts')).toHaveText('{"snapshots":2,"subscriptions":1}')
  await page.getByRole('button', { name: 'Next turn', exact: true }).click()
  await expect(page.getByTestId('transcript')).toContainText('New turn')
  await page.getByRole('button', { name: 'Release snapshot', exact: true }).click()
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(page.getByTestId('streaming')).toHaveText('true')
  await expect(page.getByTestId('assistant-1')).toHaveText('Answer')
  await expect(page.getByTestId('transcript')).toContainText('New turn')
})
