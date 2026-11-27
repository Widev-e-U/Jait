import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const shots = path.resolve(__dirname, '../../.jait/shots')

test('a desktop must save an available name before it can register', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 560 })
  await page.addInitScript(() => {
    Object.assign(window, { jaitDesktop: {
      deviceId: 'desktop-test-pc',
      gatewayUrl: location.origin,
      nativePlatform: 'windows',
      getSetting: async (key: string, fallback: unknown) => localStorage.getItem(key) ?? fallback,
      setSetting: async (key: string, value: string) => localStorage.setItem(key, value),
    } })
  })
  const registeredNames: string[] = []
  await page.routeWebSocket(/fixture-token/, (socket) => {
    socket.onMessage(raw => {
      const { type, payload } = JSON.parse(raw.toString())
      if (type !== 'fs.register-node') return
      const { id, name } = payload
      registeredNames.push(name)
      socket.send(JSON.stringify({
        type: 'node.registration',
        payload: name.toLowerCase() === 'office pc'
          ? { id, name, ok: false, code: 'DEVICE_NAME_TAKEN' }
          : { id, name, ok: true },
      }))
    })
  })
  const openFixture = () => page.evaluate(async () => {
    document.documentElement.classList.add('dark')
    await import('/src/e2e-fixtures/device-naming.tsx')
  })
  await page.goto('/src/e2e-fixtures/index.html')
  await openFixture()
  const dialog = page.getByRole('dialog', { name: 'Name this device' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  expect(registeredNames).toEqual([])

  const name = dialog.getByRole('textbox', { name: 'Device name' })
  await name.fill('Office PC')
  await dialog.getByRole('button', { name: 'Save device name' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Another device already uses that name. Choose a different name.')
  expect(registeredNames).toEqual(['Office PC'])
  expect(await page.evaluate(() => localStorage.getItem('jait-device-name'))).toBeNull()
  await mkdir(shots, { recursive: true })
  await dialog.screenshot({ path: path.join(shots, 'device-name-taken.png'), animations: 'disabled' })

  await name.fill('Studio PC')
  await dialog.getByRole('button', { name: 'Save device name' }).click()
  await expect(dialog).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('jait-device-name'))).toBe('Studio PC')

  await page.reload()
  await openFixture()
  await expect.poll(() => registeredNames).toEqual(['Office PC', 'Studio PC', 'Studio PC'])
  await expect(dialog).toHaveCount(0)
})
