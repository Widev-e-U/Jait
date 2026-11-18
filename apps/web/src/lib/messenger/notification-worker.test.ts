import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

function worker() {
  const callbacks = new Map<string, (event: unknown) => void>()
  const client = { id: 'owner-tab', focus: vi.fn(async () => {}), postMessage: vi.fn() }
  const openWindow = vi.fn(async () => {})
  const worker = { location: { origin: 'https://jait.test' }, addEventListener: (name: string, handler: (event: unknown) => void) => callbacks.set(name, handler), clients: { matchAll: vi.fn(async () => [client]), openWindow } }
  runInNewContext(readFileSync(new URL('../../../public/messenger-notifications-sw.js', import.meta.url), 'utf8'), { self: worker, URL })
  async function click(action: string, link = '/messenger?action=mark-read&roomId=!room&eventId=$old&account=@me&homeserver=https%3A%2F%2Fmatrix.test') {
    const close = vi.fn()
    let task: Promise<void> | undefined
    callbacks.get('notificationclick')!({ action, notification: { close, data: { id: 'matrix:$old', clientId: client.id, link: '/messenger?roomId=!room', markReadLink: link, scope: 'https://gateway.test' } }, waitUntil: (promise: Promise<void>) => { task = promise } })
    await task
    return close
  }
  return { click, worker, client, openWindow }
}

describe('browser notification actions', () => {
  it('routes a mark-read action to its original tab without focusing or reloading it', async () => {
    const { click, client, openWindow } = worker()
    const close = await click('mark-read')
    expect(close).toHaveBeenCalledOnce()
    expect(client.focus).not.toHaveBeenCalled()
    expect(openWindow).not.toHaveBeenCalled()
    expect(client.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'jait-notification-open', activation: expect.objectContaining({ id: 'matrix:$old', link: expect.stringContaining('eventId=$old'), scope: 'https://gateway.test' }) }))
  })
  it('opens the selected conversation on an ordinary notification click', async () => {
    const { click, client } = worker()
    await click('')
    expect(client.focus).toHaveBeenCalledOnce()
    expect(client.postMessage.mock.calls[0]?.[0].activation.link).toBe('/messenger?roomId=!room')
  })
  it('opens Jait with the exact pending action when the original tab is closed', async () => {
    const { click, worker: scope, openWindow } = worker()
    scope.clients.matchAll.mockResolvedValue([])
    await click('mark-read')
    expect(openWindow).toHaveBeenCalledWith(expect.stringContaining('https://jait.test/messenger?action=mark-read'))
  })
  it.each(['https://evil.test', '//evil.test/messenger?', '/messenger?x=\\evil', '/api/terminal?'])('rejects untrusted action targets (%s)', async target => {
    const { click, client, openWindow } = worker()
    await click('mark-read', target)
    expect(client.postMessage).not.toHaveBeenCalled()
    expect(openWindow).not.toHaveBeenCalled()
  })
})
