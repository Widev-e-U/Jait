import { describe, expect, it } from 'vitest'
import { compareCachePrefix } from './context-cache.js'

describe('cache prefix comparisons', () => {
  it('distinguishes appended messages from changes to earlier request data', () => {
    const initial = compareCachePrefix({ tools: [{ name: 'read' }], messages: [{ role: 'user', content: 'hello' }] })
    expect(initial.changes).toBeUndefined()
    const appended = compareCachePrefix({ tools: [{ name: 'read' }], messages: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi' }] }, initial.snapshot)
    expect(appended.changes).toEqual({ toolsChanged: false, previousMessagesChanged: false })
    const changed = compareCachePrefix({ tools: [{ name: 'search' }], messages: [{ role: 'user', content: 'edited' }] }, appended.snapshot)
    expect(changed.changes).toEqual({ toolsChanged: true, previousMessagesChanged: true })
  })
})
