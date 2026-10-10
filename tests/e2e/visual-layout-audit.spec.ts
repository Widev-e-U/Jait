import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const api = process.env.API_URL || 'http://127.0.0.1:8100'
const output = '/tmp/jait-visual-audit'
const pages = ['/', '/agents', '/threads', '/pulls', '/todo', '/emails', '/calendar', '/memory', '/jobs', '/network', '/settings']
const settings = ['General', 'API', 'Tools', 'Extensions', 'Skills', 'Mail & Calendar', 'Channels', 'Nodes', 'Shortcuts', 'Usage', 'Activity', 'Changelog']
let token: string

test.beforeAll(async ({ request }) => {
  const credentials = { username: 'visual-layout-audit', password: 'visual-audit-test-password' }
  let response = await request.post(`${api}/api/auth/login`, { data: credentials })
  if (!response.ok()) {
    const ownerCredentials = { username: 'e2e-agent-owner', password: 'e2e-owner-test-password' }
    let owner = await request.post(`${api}/api/auth/register`, { data: ownerCredentials })
    if (!owner.ok()) owner = await request.post(`${api}/api/auth/login`, { data: ownerCredentials })
    expect(owner.ok()).toBeTruthy()
    const { access_token: ownerToken } = await owner.json()
    const invited = await request.post(`${api}/api/auth/invitations`, { headers: { Authorization: `Bearer ${ownerToken}` } })
    expect(invited.ok()).toBeTruthy()
    const { invitation } = await invited.json()
    response = await request.post(`${api}/api/auth/register`, { data: { ...credentials, invitation } })
  }
  expect(response.ok()).toBeTruthy()
  token = (await response.json()).access_token
  await mkdir(output, { recursive: true })
})

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`audit pages and settings at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(240_000)
    page.setDefaultTimeout(10_000)
    page.on('pageerror', error => console.log('PAGE ERROR', page.url(), error.stack || error.message))
    await page.setViewportSize(viewport)
    await page.context().addCookies([{ name: 'jait_token', value: token, url: api, httpOnly: true, sameSite: 'Lax' }])
    await page.addInitScript(({ token, api }) => {
      localStorage.setItem('jait-auth-token', token)
      localStorage.setItem('token', token)
      sessionStorage.setItem('jait-auth-token', token)
      localStorage.setItem('jait-gateway-url', api)
    }, { token, api })
    const reports: Array<{ name: string; documentOverflow: number; overflow: unknown[] }> = []
    const capture = async (name: string) => {
      await page.waitForTimeout(300)
      const issues = await page.evaluate(() => {
        const visible = (element: Element) => {
          const r = element.getBoundingClientRect()
          const s = getComputedStyle(element)
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
        }
        const overflow = [...document.querySelectorAll('main *, [role="dialog"] *, [role="tabpanel"] *')].filter(visible).filter(element => {
          const r = element.getBoundingClientRect()
          if (r.left >= -2 && r.right <= innerWidth + 2) return false
          for (let p = element.parentElement; p; p = p.parentElement) {
            const s = getComputedStyle(p)
            if (['auto', 'scroll', 'hidden'].includes(s.overflowX)) return false
          }
          return true
        }).slice(0, 15).map(e => ({ tag: e.tagName, text: e.textContent?.slice(0,100), class: e.className, rect: e.getBoundingClientRect().toJSON() }))
        return { documentOverflow: document.documentElement.scrollWidth - innerWidth, overflow }
      })
      reports.push({ name, ...issues })
      await page.screenshot({ path: `${output}/${viewport.width}-${name}.png`, fullPage: true, animations: 'disabled' })
    }
    for (const theme of ['light', 'dark']) {
      for (const path of pages) {
        await page.goto(path === '/jobs' ? '/agents' : path, { waitUntil: 'domcontentloaded' })
        if (path === '/') {
          const skip = page.getByRole('button', { name: 'Skip for now', exact: true })
          await skip.waitFor({ timeout: 3_000 }).then(() => skip.click()).catch(() => {})
        }
        await page.waitForSelector('button[aria-label="Account menu"]', { timeout: 30_000 })
        if (path === '/jobs') {
          await page.evaluate(async () => {
            const modulePath = '/src/lib/notification-navigation.ts'
            const { openNotification } = await import(/* @vite-ignore */ modulePath)
            openNotification({ id: 'visual-jobs', link: '/jobs' })
          })
          await expect(page.getByRole('heading', { name: 'Scheduled Jobs' })).toBeVisible()
        }
        await page.evaluate(theme => {
          document.documentElement.classList.toggle('dark', theme === 'dark')
          document.documentElement.classList.toggle('light', theme === 'light')
        }, theme)
        await capture(`${theme}-${path.slice(1) || 'chat'}`)
      }
      for (const section of settings) {
        if (viewport.width < 640) {
          await page.getByRole('combobox', { name: 'Settings page', exact: true }).click()
          await page.getByRole('option', { name: section === 'Nodes' ? 'Nodes & Permissions' : section, exact: true }).click()
        } else await page.getByRole('tab', { name: section, exact: true }).click()
        await capture(`${theme}-settings-${section.replace(/[^a-z]/gi,'-')}`)
      }
    }
    await writeFile(`${output}/${viewport.width}-report.json`, JSON.stringify(reports, null, 2))
    const failures = reports.filter(r => r.documentOverflow > 2 || r.overflow.length)
    console.log(JSON.stringify(failures))
    expect(failures).toEqual([])
  })
}

test('catalogue graph border stays within its visible scroll region', async ({ page }) => {
  await page.context().addCookies([{ name: 'jait_token', value: token, url: api, httpOnly: true, sameSite: 'Lax' }])
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('token', token)
    localStorage.setItem('jait-gateway-url', api)
  }, { token, api })
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 600 }, { width: 1024, height: 400 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/agents')
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Catalogue', exact: true }).click()
    const graph = page.getByTestId('catalogue-graph')
    await expect(graph.locator('canvas')).toBeVisible()
    await page.waitForTimeout(300)
    const geometry = await graph.evaluate(element => {
      const r = element.getBoundingClientRect()
      const parent = element.parentElement!
      const p = parent.getBoundingClientRect()
      return { bottom: r.bottom, visibleBottom: p.bottom, height: r.height, parentHeight: p.height, overflow: getComputedStyle(parent).overflowY }
    })
    await page.screenshot({ path: `${output}/catalogue-${viewport.width}-${viewport.height}.png`, animations: 'disabled' })
    console.log(JSON.stringify({ viewport, geometry }))
    expect(geometry.bottom, `Graph bottom border clipped at ${viewport.width}×${viewport.height}`).toBeLessThanOrEqual(geometry.visibleBottom + 1)
    await page.keyboard.press('Escape')
  }
})


test('job dialog stays inside a short mobile viewport', async ({ page }) => {
  test.setTimeout(60_000)
  await page.context().addCookies([{ name: 'jait_token', value: token, url: api, httpOnly: true, sameSite: 'Lax' }])
  await page.setViewportSize({ width: 360, height: 640 })
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('token', token)
    localStorage.setItem('jait-gateway-url', api)
  }, { token, api })
  await page.goto('/agents')
  await page.getByRole('button', { name: 'Account menu' }).waitFor()
  await page.evaluate(async () => {
    const modulePath = '/src/lib/notification-navigation.ts'
    const { openNotification } = await import(/* @vite-ignore */ modulePath)
    openNotification({ id: 'visual-job-dialog', link: '/jobs' })
  })
  await page.getByRole('button', { name: 'New Job', exact: true }).click()
  const dialog = page.getByTestId('create-job-dialog')
  await expect(dialog).toBeVisible()
  const geometry = await dialog.evaluate(el => {
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: innerHeight, width: innerWidth }
  })
  await page.screenshot({ path: `${output}/job-dialog-mobile.png` })
  console.log(JSON.stringify(geometry))
  expect(geometry.top).toBeGreaterThanOrEqual(0)
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height)
  expect(geometry.left).toBeGreaterThanOrEqual(0)
  expect(geometry.right).toBeLessThanOrEqual(geometry.width)
})

test('mobile shortcut labels have a full row above their controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.context().addCookies([{ name: 'jait_token', value: token, url: api, httpOnly: true, sameSite: 'Lax' }])
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('token', token)
    localStorage.setItem('jait-gateway-url', api)
  }, { token, api })
  await page.goto('/settings')
  await page.getByRole('combobox', { name: 'Settings page' }).click()
  await page.getByRole('option', { name: 'Shortcuts', exact: true }).click()
  const row = page.locator('li').filter({ has: page.getByRole('button', { name: 'Unbind Open settings', exact: true }) })
  const sizes = await row.evaluate(el => ({ row: el.clientWidth, label: el.firstElementChild!.getBoundingClientRect().width }))
  console.log(JSON.stringify(sizes))
  expect(sizes.label).toBeGreaterThan(sizes.row - 30)
})
