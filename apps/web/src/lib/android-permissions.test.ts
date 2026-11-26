import { afterEach, expect, it, vi } from 'vitest'
import { hasAndroidPermissions, requestAndroidMicrophone } from './android-permissions'

const bridge = vi.hoisted(() => ({
  getPlatform: vi.fn(),
  isPluginAvailable: vi.fn(),
  requestMicrophone: vi.fn(),
  openAppSettings: vi.fn(),
}))
vi.mock('@capacitor/core', () => ({ Capacitor: bridge, registerPlugin: () => bridge }))

afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})

it('only exposes the Android controls when the native bridge is available', () => {
  bridge.isPluginAvailable.mockReturnValue(true)
  bridge.getPlatform.mockReturnValue('web')
  expect(hasAndroidPermissions()).toBe(false)
  bridge.getPlatform.mockReturnValue('android')
  expect(hasAndroidPermissions()).toBe(true)
  bridge.isPluginAvailable.mockReturnValue(false)
  expect(hasAndroidPermissions()).toBe(false)
})

it('allows capture after the Android permission request grants microphone access', async () => {
  bridge.requestMicrophone.mockResolvedValue({ state: 'granted' })
  await expect(requestAndroidMicrophone()).resolves.toBe(true)
  expect(bridge.openAppSettings).not.toHaveBeenCalled()
})

it('leaves a retryable denial in Android and offers Settings for a blocked prompt', async () => {
  const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
  vi.stubGlobal('window', { confirm })
  bridge.requestMicrophone.mockResolvedValueOnce({ state: 'prompt-with-rationale' })
    .mockResolvedValue({ state: 'denied' })

  await expect(requestAndroidMicrophone()).resolves.toBe(false)
  expect(confirm).not.toHaveBeenCalled()
  await expect(requestAndroidMicrophone()).resolves.toBe(false)
  expect(bridge.openAppSettings).not.toHaveBeenCalled()
  await expect(requestAndroidMicrophone()).resolves.toBe(false)
  expect(bridge.openAppSettings).toHaveBeenCalledOnce()
})
