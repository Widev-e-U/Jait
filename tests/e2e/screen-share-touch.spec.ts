import { expect, test } from '@playwright/test'

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, screenshot: 'off' })

test('touch moves the shared cursor, taps click, and releasing control stops input', async ({ page }) => {
  const actions: Array<{ action: string; x?: number; y?: number }> = []
  const session = {
    id: 'fixture-share', status: 'sharing', hostDeviceId: 'fixture-host', controllerDeviceId: null,
    viewers: [{ deviceId: 'fixture-viewer', connectedAt: '', canControl: true, transportMode: 'p2p', latencyMs: 0 }],
    capabilities: { remoteInput: true, recording: false, turnRelay: false, adaptiveStreaming: false },
    transport: { iceConnectionState: 'connected', routeMode: 'p2p', avgLatencyMs: 0, relayActive: false },
    updatedAt: '', chatId: 'fixture-chat', nodeId: 'fixture-host', controlOwner: 'user', pendingApproval: false,
  }
  await page.route('**/api/screen-share/chat/fixture-chat', route => route.fulfill({ json: { session } }))
  await page.route('**/api/screen-share/control/**', route => {
    const operation = new URL(route.request().url()).pathname.split('/').at(-1)
    if (operation === 'act') actions.push(route.request().postDataJSON().input)
    return route.fulfill({ json: operation === 'start' ? { ok: true, controlId: 'fixture-control' } : { ok: true, text: null } })
  })
  await page.goto('/screen-share-repro.html')
  const panel = page.getByRole('region', { name: 'Chat screen share' })
  const video = panel.locator('video')
  await expect.poll(() => video.evaluate(element => element.videoWidth)).toBe(640)
  await panel.getByRole('button', { name: 'Take control' }).click()
  await expect(panel.getByRole('button', { name: 'Agent mode' })).toBeVisible()

  const pointer = async (type: string, x: number, y: number, id = 1) => video.evaluate((element, data) => {
    element.dispatchEvent(new PointerEvent(data.type, {
      bubbles: true, cancelable: true, pointerId: data.id, pointerType: 'touch',
      clientX: data.x, clientY: data.y, button: 0,
    }))
  }, { type, x, y, id })

  await pointer('pointerdown', 100, 100)
  await pointer('pointermove', 160, 130)
  await pointer('pointerup', 160, 130)
  await expect.poll(() => actions.filter(action => action.action === 'move').length).toBeGreaterThan(0)
  expect(actions.some(action => action.action === 'click')).toBe(false)
  const moved = actions.filter(action => action.action === 'move').at(-1)!
  expect(moved.x).toBeGreaterThan(0.5)
  expect(moved.y).toBeGreaterThan(0.5)
  await expect(panel.locator('[data-screen-share-touch-cursor]')).toBeVisible()

  await pointer('pointerdown', 180, 200, 2)
  await pointer('pointerup', 180, 200, 2)
  await expect.poll(() => actions.filter(action => action.action === 'click').length).toBe(1)
  const click = actions.find(action => action.action === 'click')!
  expect(click.x).toBeCloseTo(moved.x!, 4)
  expect(click.y).toBeCloseTo(moved.y!, 4)

  await panel.getByRole('button', { name: 'Agent mode' }).click()
  await expect(panel.getByRole('button', { name: 'Take control' })).toBeVisible()
  const count = actions.length
  await pointer('pointerdown', 100, 100, 3)
  await pointer('pointerup', 100, 100, 3)
  await page.waitForTimeout(100)
  expect(actions).toHaveLength(count)
})
