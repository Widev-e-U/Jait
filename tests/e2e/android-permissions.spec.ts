import { expect, test, type Page } from '@playwright/test'

const fixtureState = {
  microphone: 'prompt',
  notifications: 'prompt',
  calendar: 'granted',
  overlay: 'denied',
  fullScreen: 'denied',
  exactAlarms: 'not-required',
  installUpdates: 'denied',
}

type AndroidFixtureWindow = Window & {
  androidBridgeCalls: string[]
  androidPermissions: typeof fixtureState
  androidMicrophoneChoice: string
}

async function openFixture(page: Page) {
  await page.setViewportSize({ width: 360, height: 640 })
  await page.addInitScript((states) => {
    const calls: string[] = []
    Object.assign(window, {
      androidBridgeCalls: calls,
      androidPermissions: states,
      androidMicrophoneChoice: 'granted',
      androidBridge: {},
      Capacitor: {
        PluginHeaders: [{ name: 'Permissions', methods: [
          { name: 'getDevicePermissions', rtype: 'promise' },
          { name: 'manageDevicePermission', rtype: 'promise' },
          { name: 'requestMicrophone', rtype: 'promise' },
        ] }],
        nativePromise: async (_plugin: string, method: string, options?: { name?: string }) => {
          calls.push(options?.name ? `${method}:${options.name}` : method)
          if (method === 'getDevicePermissions') return { ...states }
          if (method === 'manageDevicePermission' && options?.name === 'notifications') states.notifications = 'granted'
          if (method === 'requestMicrophone') return { state: (window as AndroidFixtureWindow).androidMicrophoneChoice }
        },
      },
      MediaRecorder: class { start() {} },
      AudioContext: undefined,
    })
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      calls.push('getUserMedia')
      return new MediaStream()
    } })
  }, fixtureState)
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/android-permissions.tsx'))
}

test('the first mic tap waits for Android permission before capturing', async ({ page }) => {
  await openFixture(page)
  await page.evaluate(() => { (window as AndroidFixtureWindow).androidMicrophoneChoice = 'prompt-with-rationale' })
  const mic = page.getByRole('button', { name: 'Record voice' })
  await mic.click()
  await expect.poll(() => page.evaluate(() => (window as AndroidFixtureWindow).androidBridgeCalls)).toEqual(['requestMicrophone'])
  await expect(mic).toBeVisible()

  await page.evaluate(() => { (window as AndroidFixtureWindow).androidMicrophoneChoice = 'granted' })
  await mic.click()
  await expect(page.getByRole('button', { name: 'Recording' })).toBeVisible()
  expect(await page.evaluate(() => (window as AndroidFixtureWindow).androidBridgeCalls)).toEqual(['requestMicrophone', 'requestMicrophone', 'getUserMedia'])
})

test('shows Android permission status and refreshes after granting or returning from settings', async ({ page }) => {
  await openFixture(page)
  await page.getByRole('button', { name: 'Manage permissions' }).click()
  const dialog = page.getByRole('dialog', { name: 'Android permissions' })
  await expect(dialog.getByRole('listitem')).toHaveCount(7)
  await dialog.getByRole('button', { name: 'Allow for Notifications' }).click()
  await expect(dialog.getByRole('button', { name: 'Settings for Notifications' })).toBeVisible()

  await dialog.getByRole('button', { name: 'Settings for Install updates' }).click()
  await expect.poll(() => page.evaluate(() => (window as AndroidFixtureWindow).androidBridgeCalls)).toContain('manageDevicePermission:installUpdates')
  await page.evaluate(() => {
    (window as AndroidFixtureWindow).androidPermissions.installUpdates = 'granted'
    window.dispatchEvent(new Event('focus'))
  })
  const updates = dialog.getByRole('listitem').filter({ hasText: 'Install updates' })
  await expect(updates.getByText('Allowed', { exact: true })).toBeVisible()
})
