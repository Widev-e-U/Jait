import { expect, test } from '@playwright/test'

test('opens standalone HTML in a tab with working scripts and isolated app data', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const modulePath = '/src/lib/html-presentation.ts'
    const { openHtmlPresentation } = await import(/* @vite-ignore */ modulePath)
    const button = document.createElement('button')
    button.textContent = 'Open test presentation'
    button.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647'
    button.onclick = () => openHtmlPresentation('/project/slides.html', async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
      return `<h1>Slide 1</h1><button onclick="document.querySelector('h1').textContent='Slide 2'">Next</button><script>try { parent.localStorage.getItem('token'); document.title='unsafe' } catch { document.body.dataset.isolated='yes' }</script>`
    })
    document.body.append(button)
  })
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Open test presentation' }).click()
  const popup = await popupPromise
  const frame = popup.frameLocator('iframe')
  await expect(frame.getByRole('heading')).toHaveText('Slide 1')
  await frame.getByRole('button', { name: 'Next' }).click()
  await expect(frame.getByRole('heading')).toHaveText('Slide 2')
  await expect(frame.locator('body')).toHaveAttribute('data-isolated', 'yes')
  expect(await popup.evaluate(() => window.opener)).toBeNull()
})

test('reports blocked popups without fetching the presentation', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const modulePath = '/src/lib/html-presentation.ts'
    const { openHtmlPresentation } = await import(/* @vite-ignore */ modulePath)
    window.open = () => null
    let fetched = false
    try {
      await openHtmlPresentation('/slides.html', async () => { fetched = true; return '' })
    } catch (error) {
      return { fetched, message: String(error) }
    }
  })
  expect(result?.fetched).toBe(false)
  expect(result?.message).toContain('Allow pop-ups')
})
