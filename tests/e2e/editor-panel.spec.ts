import { expect, test } from '@playwright/test'

test('images fit, zoom, scroll and open fullscreen', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/src/e2e-fixtures/editor-panel.html?image')
  await page.getByText('/repo/example.svg', {exact:true}).first().click()
  await expect(page.getByRole('img')).toBeVisible()
  await page.getByRole('button',{name:'Actual size',exact:true}).click()
  const scroll = page.getByTestId('image-scroll-area')
  await expect.poll(()=>scroll.evaluate(element=>element.scrollWidth > element.clientWidth && element.scrollHeight > element.clientHeight)).toBe(true)
  await scroll.evaluate(element=>{element.scrollTop=300;element.scrollLeft=400})
  await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBe(300)
  await page.getByRole('button',{name:'Zoom in',exact:true}).click()
  await expect(page.getByText('125%',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Fullscreen image',exact:true}).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('img')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button',{name:'Fit image',exact:true}).click()
  await expect(page.getByText('Fit',{exact:true})).toBeVisible()
  expect(errors).toEqual([])
})

test('hiding an editor with open files stays hidden and can reopen', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/src/e2e-fixtures/editor-panel.html')
  await page.getByText('/repo/example.ts', { exact: true }).first().click()
  await expect(page.locator('[data-tab-id="ext:test"]')).toBeVisible()
  // The hide control is the EyeOff button in the tab toolbar.
  await page.locator('button').filter({ has: page.locator('svg.lucide-eye-off') }).last().click()
  await expect(page.getByTestId('editor-visible')).toHaveText('false')
  await expect(page.locator('[data-tab-id="ext:test"]')).toBeHidden()
  await page.getByRole('button', { name: 'Show editor', exact: true }).click()
  await expect(page.locator('[data-tab-id="ext:test"]')).toBeVisible()
  expect(errors).toEqual([])
})


test('mobile editor displays images and opens fullscreen', async ({ page }) => {
  await page.setViewportSize({width:393,height:851})
  await page.goto('/src/e2e-fixtures/editor-panel.html?image&mobile')
  await page.getByText('/repo/example.svg', {exact:true}).first().click()
  await expect(page.getByTestId('project-image-viewer').getByRole('img')).toBeVisible()
  await page.getByRole('button', {name:'Fullscreen image',exact:true}).click()
  await expect(page.getByRole('dialog').getByRole('img')).toBeVisible()
  await page.getByRole('button', {name:'Exit fullscreen',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
