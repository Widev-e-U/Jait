import path from 'node:path'
import { test, expect } from '@playwright/test'

const fixtureUrl = '/@fs' + path.resolve(__dirname, 'fixtures/desktop-gateway.html')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = { config: { mode: 'remote', remoteUrl: 'https://old.example', port: 18000, allowNetwork: false }, state: 'stopped', url: 'https://old.example', error: null, logs: [] }
    const calls: unknown[] = []
    Object.assign(window, {
      __hostingCalls: calls,
      __hostingFailure: null,
      __JAIT_DESKTOP_BOOT__: { runtime: 'tauri', gatewayConfig: state.config },
      jaitDesktop: {
        gatewayUrl: state.url,
        getGatewayStatus: async () => {
          if (location.search.includes('delayStatus')) await new Promise(resolve => setTimeout(resolve, 1000))
          return state
        },
        credentialClear: async () => { calls.push('credentials-cleared') },
        configureGateway: async (config: any) => {
          calls.push(config)
          if ((window as any).__hostingFailure) throw new Error((window as any).__hostingFailure)
          return { ...state, config, state: config.mode === 'local' ? 'running' : 'stopped' }
        },
        restartGatewayApp: async () => { calls.push('restart') },
      },
    })
    localStorage.setItem('jait-auth-token', 'old-secret')
    localStorage.setItem('jait-gateway-url', 'https://stale.example')
  })
})

test('hosts locally and clears the old credential before switching', async ({ page }) => {
  await page.goto(fixtureUrl)
  await expect(page.getByRole('status')).toBeVisible()
  await page.getByRole('radio', { name: 'Host on this computer' }).check()
  await page.getByRole('checkbox', { name: 'Allow other devices to connect' }).check()
  await page.getByRole('button', { name: 'Apply and restart' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__hostingCalls)).toEqual([
    'credentials-cleared', { mode: 'local', remoteUrl: 'https://old.example', port: 18000, allowNetwork: true }, 'restart',
  ])
  expect(await page.evaluate(() => localStorage.getItem('jait-auth-token'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('jait-gateway-url'))).toBeNull()
})

test('shows startup failure and allows retry without restarting', async ({ page }) => {
  await page.goto(fixtureUrl)
  await expect(page.getByRole('status')).toBeVisible()
  await page.evaluate(() => { (window as any).__hostingFailure = 'Gateway port is already in use' })
  await page.getByRole('radio', { name: 'Host on this computer' }).check()
  await page.getByRole('button', { name: 'Apply and restart' }).click()
  await expect(page.getByRole('alert')).toHaveText('Gateway port is already in use')
  await expect(page.getByRole('button', { name: 'Apply and restart' })).toBeEnabled()
  expect(await page.evaluate(() => (window as any).__hostingCalls)).not.toContain('restart')
})

test('checks a remote gateway and persists the explicit selection', async ({ page }) => {
  await page.route('https://new.example/health', route => route.fulfill({ json: { status: 'ok' } }))
  await page.goto(fixtureUrl)
  await expect(page.getByRole('status')).toBeVisible()
  await page.getByRole('textbox', { name: 'Gateway URL' }).fill('https://new.example/')
  await page.getByRole('button', { name: 'Apply and restart' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__hostingCalls)).toEqual([
    'credentials-cleared', { mode: 'remote', remoteUrl: 'https://new.example', port: 18000, allowNetwork: false }, 'restart',
  ])
})


test('does not overwrite a choice while native status is loading', async ({ page }) => {
  await page.goto(fixtureUrl + '?delayStatus=1')
  await page.getByRole('radio', { name: 'Host on this computer' }).check()
  await page.getByRole('spinbutton', { name: 'Gateway port' }).fill('19000')
  await expect(page.getByRole('status')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Host on this computer' })).toBeChecked()
  await expect(page.getByRole('spinbutton', { name: 'Gateway port' })).toHaveValue('19000')
})
