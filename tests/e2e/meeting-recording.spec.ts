import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

const setup = { configured: true, hasObsidianToken: true, parakeetUrl: 'http://127.0.0.1:18170', nemotronUrl: 'http://127.0.0.1:18172/v1',
  nemotronModel: 'nemotron', obsidianUrl: 'http://127.0.0.1:18171', obsidianVault: 'vault' }

test('floating desktop recorder keeps the main app usable and saves live edits', async ({ page, context }) => {
  await page.setViewportSize({ width: 1120, height: 740 })
  let floating: Page | undefined
  let visible = false
  let openedNote = ''
  await page.exposeFunction('meetingWindowFixture', async (action: 'prepare' | 'show' | 'hide' | 'message', message?: unknown) => {
    if (action === 'prepare') {
      if (!floating) {
        floating = await context.newPage()
        await floating.setViewportSize({ width: 620, height: 480 })
        await floating.exposeFunction('sendMeetingWindowFixture', async message => {
          await page.evaluate(detail => window.dispatchEvent(new CustomEvent('jait:meeting-window', { detail })), message)
        })
        await floating.addInitScript(() => {
          Object.assign(window, { dragCalls: 0 })
          window.jaitMeetingWindow = {
            send: (window as any).sendMeetingWindowFixture,
            startDrag: async () => { (window as any).dragCalls++ },
          }
        })
        await floating.goto('/src/e2e-fixtures/index.html')
        await floating.evaluate(() => import('/src/e2e-fixtures/meeting-recording.tsx'))
      }
      return
    }
    if (action === 'message') {
      await floating?.evaluate(detail => window.dispatchEvent(new CustomEvent('jait:meeting-window', { detail })), message)
    } else visible = action === 'show'
  })
  const captureReady = Promise.withResolvers<void>()
  await page.exposeFunction('waitForMeetingCaptureFixture', () => captureReady.promise)
  await page.exposeFunction('openMeetingNoteFixture', (url: string) => { openedNote = url })
  await page.addInitScript(() => {
    const fixture = window as any
    window.jaitDesktop = {
      platform: 'desktop', nativePlatform: 'win32', meetingWindow: fixture.meetingWindowFixture,
      openMeetingNote: fixture.openMeetingNoteFixture,
    } as Window['jaitDesktop']
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      await fixture.waitForMeetingCaptureFixture()
      const context = new AudioContext({ sampleRate: 16000 })
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
  let transcript = ''
  let receivedFullClip = false
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
    if (pathname.endsWith('/preview')) {
      const { audio, mimeType } = route.request().postDataJSON()
      expect(mimeType).toBe('audio/wav')
      const wav = Buffer.from(audio, 'base64')
      expect(wav.subarray(0, 4).toString()).toBe('RIFF')
      if (receivedFullClip) return route.fulfill({ json: [] })
      const seconds = wav.readUInt32LE(40) / (2 * 16000)
      if (seconds < 8) return route.fulfill({ json: [{ start: 0, text: seconds < 2 ? 'Let’s ship' : 'Let’s ship the dashboard' }] })
      receivedFullClip = true
      return route.fulfill({ json: [
        { start: 0, text: 'Let’s ship the dashboard on Friday. I’ll update the release notes.' },
        { start: 5, text: 'Can you also include the mobile screenshots?' },
      ] })
    }
    if (pathname.endsWith('/audio')) {
      const payload = route.request().postDataJSON()
      expect(payload.audio.length).toBeGreaterThan(0)
      uploaded += Buffer.from(payload.audio, 'base64').length
      return route.fulfill({ json: job() })
    }
    if (pathname.endsWith('/submit')) {
      const review = route.request().postDataJSON()
      expect(review).toMatchObject({ complete: true, autoSave: true })
      transcript = review.transcript
      stage = 'complete'
      return route.fulfill({ json: job() })
    }
    expect(pathname).not.toMatch(/\/save$/)
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
  await button.click()
  await expect.poll(() => visible).toBe(true)
  const dialog = floating!.getByRole('main', { name: 'Meeting recorder window' })
  await expect(dialog).toBeVisible()
  const draftWords = await dialog.evaluateHandle(element => {
    const values: string[] = []
    new MutationObserver(() => {
      const text = element.querySelector('[aria-label="Transcribing now"] p')?.textContent
      if (text && text !== values.at(-1)) values.push(text)
    }).observe(element, { childList: true, characterData: true, subtree: true })
    return values
  })
  captureReady.resolve()
  const draft = dialog.getByLabel('Transcribing now')
  await expect(draft.locator('p')).toHaveText('Let’s ship the dashboard')
  expect(await draftWords.evaluate(values => [...values])).toEqual(['Let’s', 'Let’s ship', 'Let’s ship the', 'Let’s ship the dashboard'])
  await expect(dialog.getByRole('textbox', { name: /Transcript at/ })).toHaveCount(0)
  await floating!.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/meeting-recorder-word-stream.png'), animations: 'disabled' })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('Parakeet URL')).toBeEnabled()
  const header = dialog.locator('header')
  const hide = header.getByRole('button', { name: 'Hide recorder' })
  await expect(header.getByLabel('Elapsed time')).toHaveText(/\d{2}:\d{2}:\d{2}/)
  await expect(hide).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Meeting recorder' })).toHaveCount(0)
  await expect(dialog.locator('footer').getByRole('button', { name: /Hide/ })).toHaveCount(0)
  await expect(dialog.locator('footer').getByRole('button', { name: 'Stop recording' })).toBeVisible()
  await header.getByRole('heading', { name: 'Recording', exact: true }).click()
  await expect.poll(() => floating!.evaluate(() => (window as any).dragCalls)).toBe(1)
  await expect(dialog.getByRole('button', { name: /^(Minimize|Maximize|Close)$/ })).toHaveCount(0)
  const firstLine = dialog.getByRole('textbox', { name: 'Transcript at 00:00:00', exact: true })
  await expect(firstLine).toHaveValue(/ship the dashboard/, { timeout: 16_000 })
  await expect(draft).toHaveCount(0)
  await dialog.getByLabel('Speaker at 00:00:00').fill('Jakob')
  await firstLine.fill('Let’s ship the dashboard on Thursday. I’ll update the release notes.')
  await firstLine.evaluate((field: HTMLTextAreaElement) => {
    const splitAt = field.value.indexOf('I’ll')
    field.setSelectionRange(splitAt, splitAt)
  })
  await dialog.getByRole('button', { name: 'Split transcript at 00:00:00' }).click()
  await dialog.getByLabel('Speaker at 00:00:00').nth(1).fill('Maya')
  await dialog.getByLabel('Speaker at 00:00:05').fill('Jakob')
  await hide.click()
  await expect.poll(() => visible).toBe(false)
  await expect.poll(() => floating!.evaluate(() => (window as any).dragCalls)).toBe(1)
  expect(uploaded).toBe(0)
  await page.getByRole('button', { name: 'View meeting recording' }).click()
  await expect.poll(() => visible).toBe(true)
  await expect(dialog.getByLabel('Speaker at 00:00:00').nth(1)).toHaveValue('Maya')
  await floating!.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/meeting-recorder-floating-desktop.png'), animations: 'disabled' })
  await dialog.getByRole('button', { name: 'Stop recording' }).click()
  await expect(dialog.getByText('Saved to Obsidian')).toBeVisible({ timeout: 15_000 })
  expect(transcript).toMatch(/Jakob: .*Thursday.*Maya: I’ll update the release notes/s)
  await dialog.getByRole('button', { name: 'Open in Obsidian' }).click()
  await expect.poll(() => openedNote).toMatch(/^obsidian:\/\/open/)
})

test('Android foreground recorder shows speech and preserves edits on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 })
  await page.addInitScript(() => {
    const size = 32
    const frame = [0xff, 0xf1, 0x58, 0x40, size >> 3, ((size & 7) << 5) | 31, 0xfc, ...Array(size - 7).fill(0)]
    const audio = String.fromCharCode(...frame).repeat(188)
    let phase = 'idle'
    let id = ''
    let startedAt = 0
    Object.assign(window, {
      androidBridge: {},
      Capacitor: {
        PluginHeaders: [{ name: 'MeetingRecorder', methods: ['start', 'state', 'read', 'stop', 'discard'].map(name => ({ name, rtype: 'promise' })) }],
        async nativePromise(_plugin: string, method: string, options: { id: string; offset: number; length: number }) {
          if (method === 'start') { id = options.id; startedAt = Date.now(); phase = 'recording' }
          if (method === 'stop') phase = 'ready'
          if (method === 'discard') phase = 'idle'
          if (method === 'state') {
            const recorded = phase === 'recording' ? Math.floor((Date.now() - startedAt) / 20) * size : audio.length
            return { phase, id, startedAt, size: Math.min(recorded, audio.length), mimeType: 'audio/aac' }
          }
          if (method === 'read') return { audio: btoa(audio.slice(options.offset, options.offset + options.length)) }
        },
      },
    })
  })
  let draft = ''
  let uploadedBytes = 0
  await page.route('**/api/meeting-recordings/**', route => {
    const url = new URL(route.request().url()).pathname
    const method = route.request().method()
    if (url.endsWith('/settings')) return route.fulfill({ json: setup })
    if (url.endsWith('/preview')) {
      const { audio, mimeType } = route.request().postDataJSON()
      expect(mimeType).toBe('audio/aac')
      const text = Buffer.from(audio, 'base64').length < 188 * 32 ? 'I can confirm' : 'I can confirm the timeline with design.'
      return route.fulfill({ json: [{ start: 2, text }] })
    }
    if (url.endsWith('/audio')) uploadedBytes += Buffer.from(route.request().postDataJSON().audio, 'base64').length
    if (url.endsWith('/submit')) {
      const review = route.request().postDataJSON()
      expect(review).toMatchObject({ complete: true, autoSave: true })
      draft = review.transcript
    }
    return route.fulfill({ json: method === 'GET' ? null : { id: 'android-fixture', startedAt: '2026-11-28T09:00:00.000Z', uploadedBytes,
      ...(draft ? { stage: 'complete', notePath: 'Meetings/2026-11-28 Meeting.md' } : { stage: 'uploading' }) } })
  })
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/meeting-recording.tsx'))
  await page.getByRole('button', { name: 'Record meeting', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Meeting recorder' })
  await expect(dialog.getByLabel('Transcribing now').locator('p')).toHaveText('I can confirm')
  await dialog.getByLabel('Speaker at 00:00:02').fill('Maya')
  await expect(dialog.getByRole('button', { name: 'Stop recording' })).toBeInViewport()
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/meeting-recorder-live-android.png'), animations: 'disabled' })
  await dialog.getByRole('button', { name: 'Stop recording' }).click()
  await expect(dialog.getByText('Saved to Obsidian')).toBeVisible()
  expect(draft).toBe('[00:00:02] Maya: I can confirm the timeline with design.')
})


test('a long transcript scrolls inside the floating recorder', async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 480 })
  await page.addInitScript(() => {
    window.jaitMeetingWindow = { send: async () => {}, startDrag: async () => {} }
  })
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/meeting-recording.tsx'))
  const rows = [
    ['Maya', 'The team has finished the dashboard accessibility pass.'],
    ['Jakob', 'Let’s include the mobile screenshots in the release notes.'],
    ['Maya', 'I’ll verify the layout on a narrow screen this afternoon.'],
    ['Jakob', 'We can send the final draft to the team on Thursday.'],
    ['Maya', 'I’ll post the review link once the screenshots are ready.'],
    ['Jakob', 'Let’s keep Monday’s check-in to fifteen minutes.'],
    ['Maya', 'I’ll add the deployment status to the agenda.'],
    ['Jakob', 'Thanks. We’ll pick up the remaining items next week.'],
  ].map(([speaker, text], index) => ({ id: String(index), start: index * 45, speaker, text }))
  const publish = (lines: typeof rows) => page.evaluate(lines => {
    window.dispatchEvent(new CustomEvent('jait:meeting-window', { detail: {
      type: 'state', dark: false, state: {
        configured: true, phase: 'recording', seconds: 332,
        transcript: { lines, queued: 0, hasGap: false }, job: null, pending: false, error: '', saving: false, review: '',
      },
    } }))
  }, lines)
  await publish(rows.slice(0, -1))
  const region = page.getByRole('region', { name: 'Transcript', exact: true })
  const position = () => region.evaluate(el => ({ top: el.scrollTop, overflow: el.scrollHeight - el.clientHeight }))
  await expect.poll(async () => (await position()).top).toBeGreaterThan(0)
  const { top, overflow } = await position()
  expect(Math.abs(top - overflow)).toBeLessThan(2)
  await expect(page.getByRole('heading', { name: 'Live transcript' })).toHaveCount(0)
  await expect(page.locator('header')).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeInViewport()
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/meeting-recorder-scroll.png'), animations: 'disabled' })
  await region.hover()
  await page.mouse.wheel(0, -2000)
  await expect.poll(async () => (await position()).top).toBe(0)
  await expect(region.getByLabel('Transcript at 00:00:00')).toBeInViewport()
  await publish(rows)
  await expect(region.getByLabel('Transcript at 00:05:15')).toHaveCount(1)
  expect((await position()).top).toBe(0)
})
