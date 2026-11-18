import { describe, expect, it, vi } from 'vitest'
import { ChatNotificationSync } from './chat-notification-sync'

const first = { id: 'reply-1', sessionId: 'chat', replaceId: 'chat-complete:chat', read: false }

describe('chat notification read synchronization', () => {
  it('acknowledges only a visible chat and retries on reconnect/focus', () => {
    let visible: string | null = null
    const send = vi.fn()
    const dismiss = vi.fn()
    const sync = new ChatNotificationSync(() => visible, send, dismiss)
    sync.receive(first)
    expect(send).not.toHaveBeenCalled()
    visible = 'other'
    sync.readVisible()
    expect(send).not.toHaveBeenCalled()
    visible = 'chat'
    sync.readVisible()
    expect(send).toHaveBeenCalledWith(first)
    sync.receive(first) // reconnect snapshot
    expect(send).toHaveBeenCalledTimes(2)
    sync.receive({ ...first, read: true })
    expect(dismiss).toHaveBeenCalledWith({ ...first, read: true })
    sync.readVisible()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('does not clear a newer reply when an old dismissal arrives', () => {
    const dismiss = vi.fn()
    const sync = new ChatNotificationSync(() => null, vi.fn(), dismiss)
    sync.receive(first)
    sync.receive({ ...first, id: 'reply-2' })
    sync.receive({ ...first, read: true })
    sync.afterShow(first.id, first.sessionId)
    sync.receive(first) // delayed delivery of the old event
    expect(dismiss).not.toHaveBeenCalled()
    sync.receive({ ...first, id: 'reply-2', read: true })
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('suppresses a late delivery and clears a post that finishes after its read', () => {
    const dismiss = vi.fn()
    const sync = new ChatNotificationSync(() => null, vi.fn(), dismiss)
    sync.receive({ ...first, read: true })
    sync.receive(first)
    sync.afterShow(first.id, first.sessionId)
    expect(dismiss).toHaveBeenCalledTimes(3)
    sync.reset()
    sync.receive(first)
    sync.afterShow(first.id, first.sessionId)
    expect(dismiss).toHaveBeenCalledTimes(3)
  })

  it('ignores malformed states and arbitrary notification card IDs', () => {
    const send = vi.fn()
    const dismiss = vi.fn()
    const sync = new ChatNotificationSync(() => 'chat', send, dismiss)
    for (const value of [null, {}, { ...first, replaceId: 'attention:approval' }, { ...first, id: [] }]) sync.receive(value)
    expect(send).not.toHaveBeenCalled()
    expect(dismiss).not.toHaveBeenCalled()
  })
})
