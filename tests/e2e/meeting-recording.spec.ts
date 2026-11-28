import { expect, test } from '@playwright/test'
import path from 'node:path'

const setup = { configured: true, hasObsidianToken: true, parakeetUrl: 'http://127.0.0.1:18170', nemotronUrl: 'http://127.0.0.1:18172/v1',
  nemotronModel: 'nemotron', obsidianUrl: 'http://127.0.0.1:18171', obsidianVault: 'vault' }

test('desktop capture appears after setup, uploads and links the finished note', async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 740 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      const context = new AudioContext()
      const destination = context.createMediaStreamDestination()
      const oscillator = context.createOscillator()
      oscillator.connect(destination)
      oscillator.start()
      destination.stream.getAudioTracks()[0].addEventListener('ended', () => void context.close())
      return destination.stream
    } })
  })
  let configured = false
  let stage = 'uploading'
  let uploaded = 0
  let requests = 0
  const job = () => ({ id: 'meeting-fixture', stage, uploadedBytes: uploaded, startedAt: '2026-11-28T09:00:00.000Z',
    ...(stage === 'complete' ? { notePath: 'Meetings/2026-11-28 Meeting.md', noteUrl: 'obsidian://open?vault=vault&file=Meetings%2F2026-11-28%20Meeting.md' } : {}) })
  await page.route('**/api/meeting-recordings/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const method = route.request().method()
    if (pathname.endsWith('/settings')) {
      if (method === 'PUT') {
        expect(route.request().postDataJSON()).toMatchObject({ obsidianVault: 'vault ' })
        configured = true
      }
      return route.fulfill({ json: { ...setup, configured } })
    }
    if (pathname.endsWith('/test')) return route.fulfill({ json: ['Parakeet', 'Nemotron', 'Obsidian'].map(service => ({ service, ok: true })) })
    if (pathname.endsWith('/audio')) {
      const payload = route.request().postDataJSON()
      expect(payload.audio.length).toBeGreaterThan(0)
      uploaded += Buffer.from(payload.audio, 'base64').length
      return route.fulfill({ json: job() })
    }
    if (pathname.endsWith('/submit')) {
      stage = 'transcribing'
      return route.fulfill({ json: job() })
    }
    if (stage === 'transcribing' && ++requests >= 2) stage = 'complete'
    return route.fulfill({ json: !uploaded && method === 'GET' ? null : job() })
  })
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/meeting-recording.tsx'))
  const button = page.getByRole('button', { name: 'Record meeting', exact: true })
  await expect(page.getByLabel('Parakeet URL')).toBeVisible()
  await expect(button).toHaveCount(0)
  await page.getByLabel('Obsidian vault name').fill('vault ')
  await page.getByRole('button', { name: 'Save meeting settings' }).click()
  await expect(button).toBeVisible()
  await page.getByRole('button', { name: 'Test connections' }).click()
  await expect(page.getByText('Obsidian · Connected')).toBeVisible()
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/meeting-recording-desktop.png') })
  await button.click()
  await expect(page.getByRole('button', { name: /Stop meeting recording \(0:01\)/ })).toBeVisible()
  await page.getByRole('button', { name: /Stop meeting recording/ }).click()
  await expect(page.getByRole('button', { name: 'Meeting saved' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Meeting saved' }).click()
  await expect(page.getByRole('link', { name: 'Open in Obsidian' })).toHaveAttribute('href', /^obsidian:\/\/open/)
})

test('Android layout shows active recording controls in the header', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      const context = new AudioContext()
      return context.createMediaStreamDestination().stream
    } })
  })
  await page.route('**/api/meeting-recordings/settings', route => route.fulfill({ json: setup }))
  await page.route('**/api/meeting-recordings/jobs', route => route.fulfill({ json: null }))
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/meeting-recording.tsx'))
  await page.getByRole('button', { name: 'Record meeting', exact: true }).click()
  const stop = page.getByRole('button', { name: /Stop meeting recording \(0:01\)/ })
  await expect(stop).toBeInViewport()
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/meeting-recording-android.png') })
})
