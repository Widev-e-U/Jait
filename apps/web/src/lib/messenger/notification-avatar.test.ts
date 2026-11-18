import { describe, expect, it, vi } from 'vitest'
import { notificationAvatarUrl } from './notification-avatar'

describe('notificationAvatarUrl', () => {
  it('encodes an authenticated avatar with a detected image type', async () => {
    const load = vi.fn(async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1])]))
    expect(await notificationAvatarUrl('mxc://matrix/avatar', load)).toBe('data:image/jpeg;base64,/9j/AQ==')
    expect(load).toHaveBeenCalledWith('mxc://matrix/avatar')
  })

  it('falls back for invalid, oversized, and unavailable images', async () => {
    const load = vi.fn(async () => new Blob(['not an image']))
    expect(await notificationAvatarUrl('https://example.com/a', load)).toBeUndefined()
    expect(load).not.toHaveBeenCalled()
    expect(await notificationAvatarUrl('mxc://matrix/a', load)).toBeUndefined()
    expect(await notificationAvatarUrl('mxc://matrix/a', async () => new Blob([new Uint8Array(1024 * 1024 + 1)]))).toBeUndefined()
    expect(await notificationAvatarUrl('mxc://matrix/a', async () => { throw new Error('offline') })).toBeUndefined()
  })
})
