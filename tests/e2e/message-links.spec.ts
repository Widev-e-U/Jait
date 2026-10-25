import path from 'node:path'
import { expect, test } from '@playwright/test'

test.use({ screenshot: 'off' })
for (const width of [1280, 390]) {
  test(`message links navigate without opening bubble actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/src/e2e-fixtures/index.html')
    await page.evaluate(() => import('/src/e2e-fixtures/message-links.tsx'))
    let navigationCount = 0
    for (const name of ['Assistant', 'User', 'Response']) {
      const section = page.getByRole('region', { name, exact: true })
      // Sections without headings are addressed by their explicit accessible label.
      await section.getByRole('link', { name: 'Settings', exact: true }).click()
      await expect(page.getByLabel('Navigation count')).toHaveText(String(++navigationCount))
      await expect(page.getByLabel('Destination')).toHaveText('/settings?q=providers')
      await expect(page.getByLabel('Edited')).toHaveText('false')
      const web = section.getByRole('link', { name: 'Web', exact: true })
      await expect(web).toHaveAttribute('href', 'https://example.com/readme.md')
      const popupEvent = page.waitForEvent('popup')
      await web.click()
      await (await popupEvent).close()
    }
    await page.getByRole('region', { name: 'Assistant', exact: true }).getByRole('link', { name: /README.md/ }).click()
    await expect(page.getByLabel('Destination')).toHaveText('/home/jakob/jait/README.md')
    await page.screenshot({ path: path.resolve(__dirname, `../../.jait/shots/message-links-${width}.png`) })
  })
}

for (const width of [1280, 390]) {
  test(`Messenger links are clickable for WhatsApp conversation messages at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/src/e2e-fixtures/messenger-tools.html?roomId=%21lab%3Atest&linkTest=1')
    const messages = page.getByRole('log', { name: 'Messages' })
    const guide = messages.getByRole('link', { name: 'Guide', exact: true })
    await expect(guide).toHaveAttribute('href', 'https://example.com/guide')
    await expect(messages.getByRole('link', { name: 'https://example.com/plain', exact: true })).toBeVisible()
    await expect(messages.getByRole('link', { name: 'www.example.com', exact: true })).toHaveAttribute('href', 'http://www.example.com')
    await expect(messages.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('href', '/settings?q=providers')
    const popupEvent = page.waitForEvent('popup')
    await guide.click()
    await (await popupEvent).close()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.screenshot({ path: path.resolve(__dirname, `../../.jait/shots/messenger-links-${width}.png`) })
  })
}
