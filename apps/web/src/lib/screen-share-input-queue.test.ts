import { describe, expect, it, vi } from 'vitest'
import { ScreenShareInputQueue } from './screen-share-input-queue'

describe('screen-share input queue', () => {
  it('serializes actions and coalesces movement while another action is pending', async () => {
    const queue = new ScreenShareInputQueue()
    let release!: () => void
    const calls: string[] = []
    const first = queue.enqueue(() => new Promise(resolve => { release = resolve }))
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    const move = queue.moveTo(async () => { calls.push('old') })
    void queue.moveTo(async () => { calls.push('latest') })
    const click = queue.enqueue(async () => { calls.push('click') })
    release()
    await Promise.all([first, move, click])
    expect(calls).toEqual(['latest', 'click'])
  })
  it('keeps moves on opposite sides of an action in order', async () => {
    const queue = new ScreenShareInputQueue()
    let release!: () => void
    const calls: string[] = []
    const first = queue.enqueue(() => new Promise(resolve => { release = resolve }))
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    const before = queue.moveTo(async () => { calls.push('before') })
    const click = queue.enqueue(async () => { calls.push('click') })
    const after = queue.moveTo(async () => { calls.push('after') })
    release()
    await Promise.all([first, before, click, after])
    expect(calls).toEqual(['before', 'click', 'after'])
  })
  it('drops queued actions after cancellation', async () => {
    const queue = new ScreenShareInputQueue()
    let release!: () => void
    const effect = vi.fn(async () => {})
    const first = queue.enqueue(() => new Promise(resolve => { release = resolve }))
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    const later = queue.enqueue(effect)
    queue.cancel()
    release()
    await Promise.all([first, later])
    expect(effect).not.toHaveBeenCalled()
  })
})
